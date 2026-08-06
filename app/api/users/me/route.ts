import { discardAvatarMedia, ownsAllMedia } from "@/entities/media";
import { updateUserProfile } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
import { MAX_NICKNAME_LENGTH } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z
  .object({
    // WARN: Trimmed before the length check, or twenty spaces pass it and REQUIREMENTS.md § 8.7. falls back to the email local part for a name the user believes they set.
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH).optional(),
    // INFO: REQUIREMENTS.md § 12. Absent keeps the current photo; an explicit `null` is 기본 이미지로 되돌리기.
    avatarMediaId: z.uuid().nullish(),
    // INFO: REQUIREMENTS.md § 8.12. The 입력 중 switch. It is a `users` column the owner may write, so it rides this patch rather than an endpoint of its own.
    typingIndicatorEnabled: z.boolean().optional(),
  })
  // WARN: Every key is optional, so `{}` parses — and drizzle throws `No values to set` on the empty `.set()` that follows, which surfaces as a 500 for what is a malformed request. The UI cannot send one, but a retry or any other client can.
  .refine(
    (body) =>
      body.nickname !== undefined ||
      body.avatarMediaId !== undefined ||
      body.typingIndicatorEnabled !== undefined,
    "empty patch",
  );

/**
 * REQUIREMENTS.md § 12. The nickname and avatar, both owned by the user they
 * belong to. There is no path to editing the other participant's row — § 8.7.
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

  const { nickname, avatarMediaId, typingIndicatorEnabled } = body.data;

  // WARN: REQUIREMENTS.md § 14. The same check `POST /api/messages` runs on `mediaIds`, scoped to `avatar` rather than `chat`. `avatar_media_id` is a foreign key, so an id that is only a well-formed UUID is a 500 rather than a 400; the ownership half stops one participant wearing the other's photograph, and the scope half stops a chat photo becoming an avatar `discardAvatarMedia` would later delete out from under its bubble.
  if (avatarMediaId && !(await ownsAllMedia([avatarMediaId], user.id, "avatar"))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const update = await updateUserProfile({
    userId: user.id,
    nickname,
    avatarMediaId,
    typingIndicatorEnabled,
  });

  if (!update) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // WARN: Cleanup behind a write that already committed, so it runs after the response and cannot fail it. Awaited inline, a transient pool error here answered 500 for a save that landed — the sheet stayed open on 프로필을 저장하지 못했어요 and a retry uploaded a second avatar.
  if (update.replacedAvatarMediaId) {
    const replaced = update.replacedAvatarMediaId;

    after(() => safelyRunAsync(() => discardAvatarMedia(replaced, user.id)));
  }

  return NextResponse.json({ user: update.participant });
}
