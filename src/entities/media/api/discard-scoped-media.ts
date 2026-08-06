import "server-only";

import type { MediaUploadScope } from "@/shared/config";
import { getDb, media } from "@/shared/db";
import { deleteObjectsAfterCacheWindow, toScopePrefix, toThumbKey } from "@/shared/storage";
import { and, eq, like } from "drizzle-orm";

/**
 * Takes back the object a profile change replaced — an avatar (REQUIREMENTS.md
 * § 12.), a profile cover (§ 12.1.) or a chat wallpaper (§ 12.2.).
 *
 * WARN: The row goes now but the objects go on the § 13.4. delay. The other
 * participant is holding the 302 this id resolved to, cached for
 * `MEDIA_CACHE_MAX_AGE` (§ 9.), so their browser replays it at R2 without asking
 * us again — deleting the object alongside the row turns the previous picture into
 * a broken image rather than a stale one for the rest of that window.
 *
 * WARN: Narrowed to the caller's own prefix for `scope`, not merely to their own
 * rows. A crafted `PATCH` can point any of those three columns at any object its
 * sender owns, and a chat photo reached this way would be deleted out from under
 * the bubble that carries it — or fail outright on `message_media`'s non-cascading
 * key (§ 6.). The prefix is what makes "nothing else can be rendering this" true,
 * and it is why § 12.1.'s 배경으로 설정 copies a gallery photo into `background/`
 * rather than pointing at it where it lies.
 */
export async function discardScopedMedia(
  id: string,
  ownerId: string,
  scope: MediaUploadScope,
): Promise<void> {
  const [discarded] = await getDb()
    .delete(media)
    .where(
      and(
        eq(media.id, id),
        eq(media.ownerId, ownerId),
        like(media.r2Key, `${toScopePrefix(scope, ownerId)}%`),
      ),
    )
    .returning({ r2Key: media.r2Key });

  if (discarded) {
    deleteObjectsAfterCacheWindow([discarded.r2Key, toThumbKey(discarded.r2Key)]);
  }
}
