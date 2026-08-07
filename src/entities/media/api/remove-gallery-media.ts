import "server-only";

import { getDb, media, messageMedia } from "@/shared/db";
import { deleteObjects, toThumbKey } from "@/shared/storage";
import { and, inArray, isNull } from "drizzle-orm";
import { isInLibrary } from "./list-gallery-media";

export type GalleryRemoval = {
  /** Still in a bubble, so only the gallery lost them. */
  hiddenIds: string[];
  /** Nothing referenced them, so the rows and the R2 objects are gone. */
  deletedIds: string[];
};

/**
 * REQUIREMENTS.md § 18. #1. What the gallery's 삭제 does.
 *
 * The chat is the record and the gallery is a view of it, so removing a photo
 * that a message carries is scoped to the gallery: `gallery_hidden_at` is set and
 * the bubble goes on rendering it. A photo no message carries — one uploaded
 * straight into the gallery (§ 10.) — has nothing left to render it, so the row
 * and its two R2 objects are deleted outright rather than left unreachable in the
 * bucket forever.
 *
 * WARN: Deliberately not scoped to the uploader. The gallery belongs to the
 * conversation, like an emoticon pack (§ 13.1.), and § 6. has no permission tier
 * to express "only mine" with.
 */
export async function removeGalleryMedia(ids: string[]): Promise<GalleryRemoval> {
  if (ids.length === 0) {
    return { hiddenIds: [], deletedIds: [] };
  }

  const db = getDb();
  // INFO: Narrowed to what the library actually shows, so an id that never reached it removes nothing and cannot be probed with.
  // WARN: Membership without the kind test (§ 10.), so one 삭제 serves every segment — narrowed to 사진 it would silently remove nothing for a file selection.
  // WARN: This does *not* protect a gallery upload whose `postMessage` is still in flight — § 10. registers those with `gallery_added_at` set, so they are in the grid with no `message_media` child and read as orphans here. The screen is what closes that window: `useGalleryUpload` reports `isBusy` until the post settles, and selection is unavailable while it does.
  const visible = await db
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, ids), isInLibrary()));
  const targetIds = visible.map((row) => row.id);

  if (targetIds.length === 0) {
    return { hiddenIds: [], deletedIds: [] };
  }

  const attachments = await db
    .select({ mediaId: messageMedia.mediaId })
    .from(messageMedia)
    .where(inArray(messageMedia.mediaId, targetIds));
  // WARN: Every `message_media` row counts, including one whose message is soft-deleted. `media_id` is a foreign key that does not cascade (§ 6.), so deleting a row a hidden message still points at is a constraint violation rather than a cleanup.
  const attached = new Set(attachments.map((row) => row.mediaId));
  const hiddenIds = targetIds.filter((id) => attached.has(id));
  const orphanIds = targetIds.filter((id) => !attached.has(id));

  if (hiddenIds.length > 0) {
    await db
      .update(media)
      .set({ galleryHiddenAt: new Date() })
      // INFO: Idempotent — a second device hiding the same photo must not restamp it, and the guard is what makes that write a no-op.
      .where(and(inArray(media.id, hiddenIds), isNull(media.galleryHiddenAt)));
  }

  if (orphanIds.length === 0) {
    return { hiddenIds, deletedIds: [] };
  }

  const deleted = await db
    .delete(media)
    .where(inArray(media.id, orphanIds))
    .returning({ id: media.id, r2Key: media.r2Key });

  // INFO: § 13.4.'s cache window does not apply. That one exists because an *edit* leaves the row in place while swapping the object behind it; here the row a browser would ask for is gone, so the request 404s rather than replaying a redirect to a missing key.
  await deleteObjects(deleted.flatMap((row) => [row.r2Key, toThumbKey(row.r2Key)]));

  return { hiddenIds, deletedIds: deleted.map((row) => row.id) };
}
