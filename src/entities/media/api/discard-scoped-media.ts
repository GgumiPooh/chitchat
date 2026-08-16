import type { MediaId, UserId } from "@/shared/lib";
import "server-only";

import type { MediaUploadScope } from "@/shared/config";
import { getDb, media } from "@/shared/db";
import { toScopePrefix } from "@/shared/storage";
import { and, eq, isNull, like, not, type SQL } from "drizzle-orm";
import { isWornAnywhere } from "./get-media-object";

/**
 * Takes back the object a profile change replaced — an avatar (REQUIREMENTS.md
 * § 12.), a profile cover (§ 12.1.) or a chat wallpaper (§ 12.2.).
 *
 * WARN: A soft delete, and the bytes are not this function's to take. The other
 * participant is holding the 302 this id resolved to, cached for
 * `MEDIA_CACHE_MAX_AGE` (§ 9.), so their browser replays it at R2 without asking us
 * again — deleting the object alongside the row turns the previous picture into a
 * broken image rather than a stale one. Stamping `deleted_at` is what hands the object
 * to the reclaim, which purges it once `MEDIA_DELETE_GRACE` has passed.
 *
 * WARN: Narrowed to the caller's own prefix for `scope`, not merely to their own
 * rows. A crafted `PATCH` can point any of those three columns at any object its
 * sender owns, and a chat photo reached this way would be deleted out from under
 * the bubble that carries it — or fail outright on `message_media`'s non-cascading
 * key (§ 6.). The prefix is what makes "nothing else can be rendering this" true,
 * and it is why § 12.1.'s 배경으로 설정 copies a library photo into `background/`
 * rather than pointing at it where it lies.
 */
export async function discardScopedMedia(
  id: MediaId,
  ownerId: UserId,
  scope: MediaUploadScope,
): Promise<void> {
  await discard(id, ownerId, scope);
}

/**
 * The same discard, refused if anything is still drawing the object
 * (REQUIREMENTS.md § 12.1., § 12.2.).
 *
 * WARN: **Every `background/` discard MUST come through here**, and the guard is
 * inside the UPDATE rather than a question asked before it. The two background slots
 * live in different tables and accept the same object, so a cover change and a
 * wallpaper change can each detach an id the other has since taken — and asked as a
 * separate statement, both cleanups read a state that is already stale by the time
 * they act. `NOT EXISTS` in the UPDATE's own qual is evaluated by the statement that
 * does the stamping, which is the only place the answer is still true when it is used.
 *
 * WARN: A function rather than a flag on `discardScopedMedia`, because a flag
 * defaults to the unguarded behaviour and this guard is the one a new caller must not
 * be able to forget. `avatar/` has no such hazard — nothing else accepts that scope —
 * so that path deliberately keeps the plain discard.
 */
export async function discardUnwornScopedMedia(
  id: MediaId,
  ownerId: UserId,
  scope: MediaUploadScope,
): Promise<void> {
  await discard(id, ownerId, scope, not(isWornAnywhere(id)));
}

async function discard(
  id: MediaId,
  ownerId: UserId,
  scope: MediaUploadScope,
  unless?: SQL,
): Promise<void> {
  await getDb()
    .update(media)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(media.id, id),
        eq(media.ownerId, ownerId),
        like(media.r2Key, `${toScopePrefix(scope, ownerId)}%`),
        // INFO: Idempotent — a second discard of the same row must not restamp it, which would restart `MEDIA_DELETE_GRACE` on bytes already past it.
        isNull(media.deletedAt),
        unless,
      ),
    );
}
