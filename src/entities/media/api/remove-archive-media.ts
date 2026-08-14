import type { MediaId } from "@/shared/lib";
import "server-only";

import { getDb, media } from "@/shared/db";
import { deleteObjects, toThumbKey } from "@/shared/storage";
import { and, inArray, isNull } from "drizzle-orm";
import { isInLibrary } from "./list-archive-media";

export type ArchiveRemoval = {
  /** Left the shared shelf. The bubble carrying them, and their objects, are untouched. */
  hiddenIds: MediaId[];
  /**
   * Destroyed outright.
   *
   * WARN: Always empty from `removeArchiveMedia` — hiding no longer destroys anything.
   * The field survives because `DELETE /api/archive` answers in this one shape for both
   * of its modes, and `destroyArchiveMedia` fills it.
   */
  deletedIds: MediaId[];
};

/**
 * REQUIREMENTS.md § 18. #1. 보관함에서 숨기기 — takes tiles off the shared shelf and
 * touches nothing else.
 *
 * INFO: The finished restructure. Open to **either** participant: the shelf is shared, so
 * curating it is shared. That is only defensible because it destroys nothing — the
 * bubble goes on rendering the object and the bytes stay where they are.
 *
 * WARN: § 4.2. It used to hard-delete a row no message carried, on the argument that
 * nothing rendered such a row so removing it was the only way to keep the bucket from
 * filling with unreachable objects. **That argument died when 완전히 삭제 became a
 * separate action.** The confirmation here says `보관함에서만 사라져요`, and destroying
 * an orphan under it took an original away from someone the dialog had just promised
 * otherwise. An orphan hidden here is still reachable through `destroyArchiveMedia`, which is
 * where destroying belongs.
 */
export async function removeArchiveMedia(ids: MediaId[]): Promise<ArchiveRemoval> {
  if (ids.length === 0) {
    return { hiddenIds: [], deletedIds: [] };
  }

  // INFO: Narrowed to what the library actually shows, so an id that never reached it removes nothing and cannot be probed with.
  // WARN: Membership without the shelf test (§ 10.), so one 삭제 serves every segment — narrowed to 갤러리 it would silently remove nothing for a file selection.
  const hidden = await getDb()
    .update(media)
    .set({ archiveHiddenAt: new Date() })
    // INFO: Idempotent — a second device hiding the same tile must not restamp it, and the guard is what makes that write a no-op.
    .where(and(inArray(media.id, ids), isNull(media.archiveHiddenAt), isInLibrary()))
    .returning({ id: media.id });

  return { hiddenIds: hidden.map((row) => row.id), deletedIds: [] };
}

/**
 * The finished restructure. 완전 삭제 — the object itself is destroyed, and the bubble it
 * was sent in draws a tombstone in its place.
 *
 * WARN: § 4.1. **Either participant may do this, and it is deliberately no longer
 * scoped to `owner_id`.** 보관함 is the shared album, so curating it — including
 * throwing something out for good — belongs to both of them, exactly as 숨기기 always
 * did. That reverses the § 8.13. doctrine's reach: withdrawing a *message* is still the
 * sender's alone, because the message is a thing somebody said, where an object in the
 * shared library is not. The bubble is what keeps that safe — it is never removed, only
 * its picture is, and § 4.3.'s tombstone is what the reader sees instead.
 *
 * WARN: § 4.3. With the owner test gone, **`isInLibrary()` is the only guard left and
 * carries all of the weight.** Without it this destroys any object named by id — and
 * `GET /api/users` hands out `avatarMediaId` and `profileBackgroundMediaId`, whose rows
 * sit outside the library precisely so this cannot reach them. Removing it would let
 * either participant delete the object behind the other's avatar while `users` still
 * referenced it, leaving a broken image no screen can clear.
 *
 * WARN: § 4.3. A soft delete, never a row delete. `message_media` holds a foreign key
 * that does not cascade, and § 8.13.'s resume reconciliation needs the row to survive so
 * the bubble can keep its place. Only the R2 objects actually go.
 *
 * INFO: § 4.3. The geometry is deliberately left on the row. It is what lets the
 * tombstone occupy the box the picture did, so the § 8.3. virtualized list re-measures
 * nothing when a slide is deleted out from under a reader.
 */
export async function destroyArchiveMedia(ids: MediaId[]): Promise<MediaId[]> {
  if (ids.length === 0) {
    return [];
  }

  const deleted = await getDb()
    .update(media)
    .set({ deletedAt: new Date() })
    // INFO: Idempotent, exactly as the hide above is — a second device deleting the same object must not restamp it.
    .where(and(inArray(media.id, ids), isNull(media.deletedAt), isInLibrary()))
    .returning({ id: media.id, r2Key: media.r2Key });

  await deleteObjects(deleted.flatMap((row) => [row.r2Key, toThumbKey(row.r2Key)]));

  return deleted.map((row) => row.id);
}
