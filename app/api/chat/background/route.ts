import { writeChatBackground, type ReplacedBackground } from "@/entities/chat-background";
import { discardUnwornScopedMedia, getMediaRow } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { isImageMime } from "@/shared/config";
import { safelyRunAsync, type Nullable } from "@/shared/lib";
import { toScopePrefix } from "@/shared/storage";
import { after, NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 12.2. `null` is 기본 배경으로 — the room goes back to the flat `chat-canvas`. Required rather than `nullish`, because unlike § 12.'s patch there is only one field here and an absent one would leave nothing to write.
const bodySchema = z.object({ mediaId: z.uuid().nullable() });

/**
 * REQUIREMENTS.md § 12.2. The wallpaper both participants see.
 *
 * WARN: Its own route rather than a key on `PATCH /api/users/me`, and that is the
 * whole shape of this feature: the wallpaper is not a property of the caller. Either
 * participant may set it, either may clear it, and the object being replaced
 * generally belongs to the other one.
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

  const { mediaId } = body.data;

  if (!(await isWearableBy(mediaId, user.id))) {
    return apiError("invalid_request");
  }

  const update = await writeChatBackground(mediaId);

  discardReplaced(update.replaced);

  return NextResponse.json({ backgroundMediaId: update.backgroundMediaId });
}

/**
 * WARN: REQUIREMENTS.md § 14. Ownership and scope both, exactly as § 12.'s patch
 * checks them. Shared does not mean anyone may point this at anything: the setter
 * still has to own the object, so it lands under their own `background/` prefix and
 * the cleanup above can reclaim it later.
 *
 * WARN: § 12.1. And an image. The copy route already refuses a video for the chat
 * slot, but this is writable with any `background/` object its owner holds —
 * including one copied a moment earlier for the profile. Without the check, aiming
 * that id here puts a video behind § 8.3.'s list, where an `<img>` draws it.
 *
 * INFO: One read rather than `ownsAllMedia` followed by `getMediaRow`. Both wanted
 * the same row by primary key, and the row already carries everything either test
 * needs — the second round trip bought nothing and sat on a user-visible save.
 */
async function isWearableBy(mediaId: Nullable<string>, userId: string): Promise<boolean> {
  if (!mediaId) {
    return true;
  }

  const row = await getMediaRow(mediaId);

  return Boolean(
    row &&
    row.ownerId === userId &&
    row.r2Key.startsWith(toScopePrefix("background", userId)) &&
    isImageMime(row.mime),
  );
}

/**
 * WARN: Cleanup behind a write that already committed, so it runs after the response
 * and cannot fail it — § 12.'s argument unchanged. A transient failure here answering
 * 500 for a change that landed leaves the sheet on 배경을 저장하지 못했어요, and the
 * retry uploads a second photo.
 *
 * WARN: REQUIREMENTS.md § 12.2. The **previous setter's** id, never the caller's.
 * `discardScopedMedia` narrows to `background/{ownerId}/`, so passing the person who
 * happens to be replacing it reclaims nothing at all whenever the two participants
 * take turns — and the bucket grows by a full-resolution photo each time.
 */
function discardReplaced(replaced: Nullable<ReplacedBackground>): void {
  if (!replaced) {
    return;
  }

  after(() =>
    safelyRunAsync(() => discardUnwornScopedMedia(replaced.id, replaced.ownerId, "background")),
  );
}
