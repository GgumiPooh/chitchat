import {
  discardScopedMedia,
  discardUnwornScopedMedia,
  insertMedia,
  mediaUploadSchema,
  validateMediaUpload,
  type ValidatedMedia,
} from "@/entities/media";
import { updateUserProfile, type ReplacedMedia } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_NICKNAME_LENGTH } from "@/shared/config";
import { getDb } from "@/shared/db";
import {
  safelyRunAsync,
  type MediaId,
  type Nullable,
  type Optional,
  type UserId,
} from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z
  .object({
    // WARN: Trimmed before the length check, or twenty spaces pass it and REQUIREMENTS.md § 8.7. falls back to the email local part for a name the user believes they set.
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH).optional(),
    // INFO: REQUIREMENTS.md § 12. Absent keeps the current photo; an explicit `null` is 기본 이미지로 되돌리기; an upload registers and attaches a fresh photo in the same transaction as this write.
    avatar: mediaUploadSchema.nullish(),
    // INFO: REQUIREMENTS.md § 12.1. The profile cover, published to the other participant.
    profileBackground: mediaUploadSchema.nullish(),
    // INFO: REQUIREMENTS.md § 8.12. The 입력 중 switch. It is a `users` column the owner may write, so it rides this patch rather than an endpoint of its own.
    typingIndicatorEnabled: z.boolean().optional(),
  })
  // WARN: Every key is optional, so `{}` parses — and drizzle throws `No values to set` on the empty `.set()` that follows, which surfaces as a 500 for what is a malformed request. The UI cannot send one, but a retry or any other client can.
  .refine((body) => Object.values(body).some((value) => value !== undefined), "empty patch");

/**
 * REQUIREMENTS.md § 12. The nickname, avatar and profile cover, all owned by the
 * user they belong to. There is no path to editing the other participant's row —
 * § 8.7. deliberately has no KakaoTalk-style per-contact rename.
 *
 * INFO: § 12.2. The chat wallpaper is not patched here. It stopped being a property
 * of a user when it became shared, and `PATCH /api/chat/background` owns it.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const { nickname, avatar, profileBackground, typingIndicatorEnabled } = body.data;

  // WARN: § 9. The R2 HEADs stay outside the transaction — see `validateMediaUpload`.
  const [avatarPatch, backgroundPatch] = await Promise.all([
    resolvePhotoPatch(user.id, avatar, "avatar"),
    resolvePhotoPatch(user.id, profileBackground, "background"),
  ]);

  if (avatarPatch === "unprocessable" || backgroundPatch === "unprocessable") {
    return apiError("unprocessable");
  }

  const update = await getDb().transaction(async (tx) => {
    const avatarMediaId = await toMediaId(tx, avatarPatch);
    const profileBackgroundMediaId = await toMediaId(tx, backgroundPatch);

    if (avatarMediaId === "reclaimed" || profileBackgroundMediaId === "reclaimed") {
      return "reclaimed" as const;
    }

    return updateUserProfile(tx, {
      userId: user.id,
      nickname,
      avatarMediaId,
      profileBackgroundMediaId,
      typingIndicatorEnabled,
    });
  });

  if (update === "reclaimed") {
    return apiError("unprocessable");
  }

  if (!update) {
    return apiError("not_found");
  }

  discardReplaced(update.replaced, user.id);

  return NextResponse.json({ user: update.participant });
}

/** `undefined` keeps the current photo; `null` is 기본 이미지로/없애기; a validated upload registers a fresh one. */
type PhotoPatch = Optional<Nullable<ValidatedMedia>> | "unprocessable";

async function resolvePhotoPatch(
  ownerId: UserId,
  upload: Optional<Nullable<z.infer<typeof mediaUploadSchema>>>,
  scope: "avatar" | "background",
): Promise<PhotoPatch> {
  if (upload === undefined || upload === null) {
    return upload;
  }

  const validated = await validateMediaUpload({ ownerId, upload, scope });

  return validated ?? "unprocessable";
}

async function toMediaId(
  tx: DbTransaction,
  patch: Exclude<PhotoPatch, "unprocessable">,
): Promise<Optional<Nullable<MediaId>> | "reclaimed"> {
  if (patch === undefined || patch === null) {
    return patch;
  }

  const written = await insertMedia(tx, patch);

  return written?.id ?? "reclaimed";
}

/**
 * WARN: Cleanup behind a write that already committed, so it runs after the
 * response and cannot fail it. Awaited inline, a transient pool error here answered
 * 500 for a save that landed — the sheet stayed open on 프로필을 저장하지 못했어요
 * and a retry uploaded a second photo.
 *
 * WARN: REQUIREMENTS.md § 12.2. The cover goes through `discardUnwornScopedMedia`,
 * which carries the guard inside its DELETE. A crafted patch could otherwise aim
 * this column at the shared wallpaper, and taking the replaced id at face value
 * would then delete the photo the room is still drawn from. The avatar needs no
 * such guard: its scope is `avatar/`, which no other column will accept.
 *
 * INFO: Concurrent, because the two touch different rows and different key prefixes.
 * Only the background leg pays for the guard, and it pays inside its own leg.
 */
function discardReplaced(replaced: ReplacedMedia, userId: UserId): void {
  const { avatar, background } = replaced;

  if (!avatar && !background) {
    return;
  }

  after(() =>
    Promise.all([
      avatar && safelyRunAsync(() => discardScopedMedia(avatar, userId, "avatar")),
      background &&
        safelyRunAsync(() => discardUnwornScopedMedia(background, userId, "background")),
    ]),
  );
}
