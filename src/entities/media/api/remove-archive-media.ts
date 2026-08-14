import type { MediaId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, media } from "@/shared/db";
import { deleteObjects, toThumbKey } from "@/shared/storage";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { isInLibrary } from "./list-archive-media";

export type ArchiveRemoval = {
  /** Left the shared shelf. The bubble carrying them, and their objects, are untouched. */
  hiddenIds: MediaId[];
  /**
   * Destroyed outright.
   *
   * WARN: Always empty from `removeArchiveMedia` — hiding no longer destroys anything.
   * The field survives because `DELETE /api/archive` answers in this one shape for both
   * of its modes, and `deleteOwnMedia` fills it.
   */
  deletedIds: MediaId[];
};

/**
 * REQUIREMENTS.md § 18. #1. 보관함에서 숨기기 — takes tiles off the shared shelf and
 * touches nothing else.
 *
 * INFO: RESTRUCTURE.md § 4.1. Open to **either** participant: the shelf is shared, so
 * curating it is shared. That is only defensible because it destroys nothing — the
 * bubble goes on rendering the object and the bytes stay where they are.
 *
 * WARN: § 4.2. It used to hard-delete a row no message carried, on the argument that
 * nothing rendered such a row so removing it was the only way to keep the bucket from
 * filling with unreachable objects. **That argument died when 완전히 삭제 became a
 * separate action.** The confirmation here says `보관함에서만 사라져요`, and destroying
 * an orphan under it took an original away from someone the dialog had just promised
 * otherwise. An orphan hidden here is still reachable through `deleteOwnMedia`, which is
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
 * RESTRUCTURE.md § 4.3. 완전 삭제 — the uploader destroys the object itself, and the
 * bubble it was sent in draws a tombstone in its place.
 *
 * WARN: § 4.1. Scoped to `owner_id`, and that scoping is the whole reason this is a
 * separate function from `removeArchiveMedia`. Hiding curates a shared shelf and either
 * participant may do it; this rewrites what the other participant sees in a message
 * they are reading, so it belongs to whoever put the object there — the same rule
 * § 8.13. applies to withdrawing a message.
 *
 * WARN: § 4.3. A soft delete, never a row delete. `message_media` holds a foreign key
 * that does not cascade, and § 8.13.'s resume reconciliation needs the row to survive so
 * the bubble can keep its place. Only the R2 objects actually go.
 *
 * INFO: § 4.3. The geometry is deliberately left on the row. It is what lets the
 * tombstone occupy the box the picture did, so the § 8.3. virtualized list re-measures
 * nothing when a slide is deleted out from under a reader.
 */
export async function deleteOwnMedia(ids: MediaId[], userId: UserId): Promise<MediaId[]> {
  if (ids.length === 0) {
    return [];
  }

  const deleted = await getDb()
    .update(media)
    .set({ deletedAt: new Date() })
    // WARN: `isInLibrary()` is as load-bearing as the owner test beside it, and its absence was a hole. Without it this endpoint destroys **any** object the caller owns by id — and `GET /api/users` hands out `avatarMediaId` and `profileBackgroundMediaId`, whose rows are owned by the person wearing them. A caller could delete the objects behind their own avatar and cover while `users` still referenced them, leaving both participants a permanently broken image with no screen able to clear it.
    // INFO: Idempotent, exactly as the hide above is — a second device deleting the same object must not restamp it.
    .where(
      and(
        inArray(media.id, ids),
        eq(media.ownerId, userId),
        isNull(media.deletedAt),
        isInLibrary(),
      ),
    )
    .returning({ id: media.id, r2Key: media.r2Key });

  await deleteObjects(deleted.flatMap((row) => [row.r2Key, toThumbKey(row.r2Key)]));

  return deleted.map((row) => row.id);
}
