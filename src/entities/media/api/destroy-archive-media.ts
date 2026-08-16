import type { MediaId } from "@/shared/lib";
import "server-only";

import { getDb, media } from "@/shared/db";
import { and, inArray, isNull } from "drizzle-orm";
import { isInLibrary } from "./list-archive-media";

/**
 * REQUIREMENTS.md § 18. #1. 삭제 — the object itself is destroyed, and the bubble it was
 * sent in draws a tombstone in its place. It is 보관함's only removal.
 *
 * WARN: § 4.1. **Either participant may do this, and it is deliberately not scoped to
 * `owner_id`.** 보관함 is the shared album, so curating it — including throwing something
 * out for good — belongs to both of them. That reverses the § 8.13. doctrine's reach:
 * withdrawing a *message* is still the sender's alone, because the message is a thing
 * somebody said, where an object in the shared library is not. The bubble is what keeps
 * that safe — it is never removed, only its picture is.
 *
 * WARN: § 4.3. **`isInLibrary()` is the only guard here and carries all of the weight.**
 * Without it this destroys any object named by id — and `GET /api/users` hands out
 * `avatarMediaId` and `profileBackgroundMediaId`, whose rows sit outside the library
 * precisely so this cannot reach them. Removing it would let either participant delete
 * the object behind the other's avatar while `users` still referenced it, leaving a
 * broken image no screen can clear.
 *
 * WARN: § 4.3. A soft delete, never a row delete. `message_media` holds a foreign key
 * that does not cascade, and § 8.13.'s resume reconciliation needs the row to survive so
 * the bubble can keep its place. Only the R2 objects actually go, and they go on the
 * reclaim's own pass once `MEDIA_DELETE_GRACE` has run — one grace for every media-scope
 * delete, and no longer one a peer's cached 302 (§ 9.) can be outwaited by: the bubble
 * draws its tombstone off this stamp, and a load that beats it retries past the cache.
 *
 * INFO: § 4.3. The geometry is deliberately left on the row. It is what lets the
 * tombstone occupy the box the picture did, so the § 8.3. virtualized list re-measures
 * nothing when a slide is deleted out from under a reader.
 */
export async function destroyArchiveMedia(ids: MediaId[]): Promise<MediaId[]> {
  if (ids.length === 0) {
    return [];
  }

  // WARN: Membership without the shelf test (§ 10.), so one 삭제 serves every segment — narrowed to 갤러리 it would silently remove nothing for a file selection.
  const deleted = await getDb()
    .update(media)
    .set({ deletedAt: new Date() })
    // INFO: Idempotent — a second device deleting the same object must not restamp it, and the guard is what makes that write a no-op.
    .where(and(inArray(media.id, ids), isNull(media.deletedAt), isInLibrary()))
    .returning({ id: media.id });

  return deleted.map((row) => row.id);
}
