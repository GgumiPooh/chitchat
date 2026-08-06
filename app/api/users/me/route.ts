import { discardScopedMedia, ownsAllMedia } from "@/entities/media";
import { updateUserProfile, type ReplacedMedia } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
import { MAX_NICKNAME_LENGTH } from "@/shared/config";
import { safelyRunAsync, type Maybe } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z
  .object({
    // WARN: Trimmed before the length check, or twenty spaces pass it and REQUIREMENTS.md § 8.7. falls back to the email local part for a name the user believes they set.
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH).optional(),
    // INFO: REQUIREMENTS.md § 12. Absent keeps the current photo; an explicit `null` is 기본 이미지로 되돌리기.
    avatarMediaId: z.uuid().nullish(),
    // INFO: REQUIREMENTS.md § 12.1. The profile cover, published to the other participant.
    profileBackgroundMediaId: z.uuid().nullish(),
    // INFO: REQUIREMENTS.md § 12.2. The chat wallpaper, drawn on its owner's screen alone.
    chatBackgroundMediaId: z.uuid().nullish(),
    // INFO: REQUIREMENTS.md § 8.12. The 입력 중 switch. It is a `users` column the owner may write, so it rides this patch rather than an endpoint of its own.
    typingIndicatorEnabled: z.boolean().optional(),
  })
  // WARN: Every key is optional, so `{}` parses — and drizzle throws `No values to set` on the empty `.set()` that follows, which surfaces as a 500 for what is a malformed request. The UI cannot send one, but a retry or any other client can.
  .refine((body) => Object.values(body).some((value) => value !== undefined), "empty patch");

/**
 * REQUIREMENTS.md § 12. The nickname, avatar and backgrounds, all owned by the user
 * they belong to. There is no path to editing the other participant's row — § 8.7.
 * deliberately has no KakaoTalk-style per-contact rename.
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { avatarMediaId, profileBackgroundMediaId, chatBackgroundMediaId } = body.data;

  // WARN: REQUIREMENTS.md § 14. The same check `POST /api/messages` runs on `mediaIds`, scoped per column. Each of these is a foreign key, so an id that is only a well-formed UUID is a 500 rather than a 400; the ownership half stops one participant wearing the other's photograph, and the scope half stops a chat photo becoming an avatar or a background that `discardScopedMedia` would later delete out from under its bubble.
  const isScoped = await Promise.all([
    isOwnedInScope(avatarMediaId, user.id, "avatar"),
    isOwnedInScope(profileBackgroundMediaId, user.id, "background"),
    isOwnedInScope(chatBackgroundMediaId, user.id, "background"),
  ]);

  if (isScoped.includes(false)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const update = await updateUserProfile({ userId: user.id, ...body.data });

  if (!update) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  discardReplaced(update.replaced, user.id);

  return NextResponse.json({ user: update.participant });
}

async function isOwnedInScope(
  mediaId: Maybe<string>,
  userId: string,
  scope: "avatar" | "background",
): Promise<boolean> {
  return !mediaId || ownsAllMedia([mediaId], userId, scope);
}

/**
 * WARN: Cleanup behind a write that already committed, so it runs after the
 * response and cannot fail it. Awaited inline, a transient pool error here answered
 * 500 for a save that landed — the sheet stayed open on 프로필을 저장하지 못했어요
 * and a retry uploaded a second photo.
 */
function discardReplaced(replaced: ReplacedMedia, userId: string): void {
  const discards: ScopedDiscard[] = [
    ...(replaced.avatar ? [{ id: replaced.avatar, scope: "avatar" as const }] : []),
    ...replaced.background.map((id) => ({ id, scope: "background" as const })),
  ];

  if (discards.length === 0) {
    return;
  }

  after(() =>
    Promise.all(
      discards.map(({ scope, id }) => safelyRunAsync(() => discardScopedMedia(id, userId, scope))),
    ),
  );
}

type ScopedDiscard = { scope: "avatar" | "background"; id: string };
