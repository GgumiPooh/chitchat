import { discardScopedMedia, discardUnwornScopedMedia, ownsAllMedia } from "@/entities/media";
import { updateUserProfile, type ReplacedMedia } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_NICKNAME_LENGTH, snowflakeSchema } from "@/shared/config";
import { safelyRunAsync, type Maybe, type MediaId, type UserId } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z
  .object({
    // WARN: Trimmed before the length check, or twenty spaces pass it and REQUIREMENTS.md § 8.7. falls back to the email local part for a name the user believes they set.
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH).optional(),
    // INFO: REQUIREMENTS.md § 12. Absent keeps the current photo; an explicit `null` is 기본 이미지로 되돌리기.
    avatarMediaId: snowflakeSchema<MediaId>().nullish(),
    // INFO: REQUIREMENTS.md § 12.1. The profile cover, published to the other participant.
    profileBackgroundMediaId: snowflakeSchema<MediaId>().nullish(),
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

  const { avatarMediaId, profileBackgroundMediaId } = body.data;

  // WARN: REQUIREMENTS.md § 14. The same check `POST /api/messages` runs on `mediaIds`, scoped per column. Each of these is a foreign key, so an id that is only a well-formed UUID is a 500 rather than a 400; the ownership half stops one participant wearing the other's photograph, and the scope half stops a chat photo becoming an avatar or a background that `discardScopedMedia` would later delete out from under its bubble.
  const isScoped = await Promise.all([
    isOwnedInScope(avatarMediaId, user.id, "avatar"),
    isOwnedInScope(profileBackgroundMediaId, user.id, "background"),
  ]);

  if (isScoped.includes(false)) {
    return apiError("invalid_request");
  }

  const update = await updateUserProfile({ userId: user.id, ...body.data });

  if (!update) {
    return apiError("not_found");
  }

  discardReplaced(update.replaced, user.id);

  return NextResponse.json({ user: update.participant });
}

async function isOwnedInScope(
  mediaId: Maybe<MediaId>,
  userId: UserId,
  scope: "avatar" | "background",
): Promise<boolean> {
  return !mediaId || ownsAllMedia([mediaId], userId, scope);
}

/**
 * WARN: Cleanup behind a write that already committed, so it runs after the
 * response and cannot fail it. Awaited inline, a transient pool error here answered
 * 500 for a save that landed — the sheet stayed open on 프로필을 저장하지 못했어요
 * and a retry uploaded a second photo.
 *
 * WARN: REQUIREMENTS.md § 12.2. The cover goes through `discardUnwornScopedMedia`,
 * which carries the guard inside its DELETE. `ownsAllMedia` admits any `background/`
 * object its owner holds, so a crafted patch can aim this column at the shared
 * wallpaper — and taking the replaced id at face value would then delete the photo
 * the room is still drawn from. The avatar needs no such guard: its scope is
 * `avatar/`, which no other column will accept.
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
