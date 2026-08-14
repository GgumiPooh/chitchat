import type { MediaId, UserId } from "@/shared/lib";
import "server-only";

import {
  isImageMime,
  isVideoMime,
  isWearableBackgroundVideo,
  type MediaUploadScope,
} from "@/shared/config";
import type { Media } from "@/shared/db";
import { buildStorageKey, copyObject, toThumbKey } from "@/shared/storage";
import type { ArchiveMedia } from "../model/types";
import { canReadMedia, getMediaRow } from "./get-media-object";
import { registerMedia } from "./register-media";

export type CopyMediaIntoScopeParams = {
  sourceId: MediaId;
  /** The caller, who becomes the copy's owner — the copy is theirs however the source got there. */
  userId: UserId;
  scope: MediaUploadScope;
  /**
   * WARN: REQUIREMENTS.md § 12.1. Only the **profile** background may be a video —
   * the chat wallpaper sits behind § 8.3.'s virtualized list and is drawn in an
   * `<img>`. The caller names the slot, because this function only knows the scope
   * and the two backgrounds share one.
   */
  canBeVideo?: boolean;
};

/**
 * Why a copy did not produce a row, or the row it produced.
 *
 * WARN: Three failures, not one. They map to different responses and, more to the
 * point, to different consequences: `unreachable` and `unsupported` wrote nothing,
 * while `unregistered` has already put two objects in the bucket that nothing points
 * at.
 */
export type CopyMediaResult =
  | { status: "copied"; media: ArchiveMedia }
  | { status: "unreachable" }
  | { status: "unsupported" }
  | { status: "unregistered" };

/**
 * Duplicates a `media` row and its two R2 objects into `scope`, under `userId`.
 *
 * INFO: REQUIREMENTS.md § 12.1. This is 배경으로 설정 — the route from a photo in
 * the library or a chat bubble to a background. Pointing the column at the source
 * row would have been free, and is what § 12. rules out: every pipeline's objects
 * stay inside their own scope, so that the replacement cleanup can delete them
 * without ever standing in front of a bubble that is still rendering one.
 *
 * WARN: `canReadMedia`, not ownership. The library and the conversation are shared
 * (§ 10.), so the photo worth setting as a background is routinely the other
 * participant's — but the check still has to run, or an id alone would lift any
 * object in the bucket into a scope this user owns.
 *
 * WARN: The copies are registered through `registerMedia`, which `HeadObject`s both
 * keys. That re-reads bytes § 14. already accepted once, and it is deliberate: the
 * copy is the object the app will serve from now on, and "the source passed" is a
 * claim about a different key.
 */
export async function copyMediaIntoScope({
  sourceId,
  userId,
  scope,
  canBeVideo = false,
}: CopyMediaIntoScopeParams): Promise<CopyMediaResult> {
  const source = await getMediaRow(sourceId);

  if (!source || !(await canReadMedia(source, userId))) {
    return { status: "unreachable" };
  }

  // WARN: REQUIREMENTS.md § 12.1. Checked here and not only in the viewer, which withholds the control on a video by a client-side decision this route is reachable without. A video worn where an `<img>` draws it fails, retries once and settles on the broken-asset glyph — in front of the other participant, since a cover is published — having first duplicated the whole object to get there.
  if (!isImageMime(source.mime) && !(canBeVideo && isVideoMime(source.mime))) {
    return { status: "unsupported" };
  }

  // WARN: § 12.1.'s duration and size caps are checked against the *source row*, before anything is copied. `registerMedia` re-checks the size of what actually landed, but it cannot see a duration — and a copy is the one path where the bytes never pass through a client that could measure one.
  if (isVideoMime(source.mime) && !isWearableSource(source)) {
    return { status: "unsupported" };
  }

  const r2Key = buildStorageKey(scope, userId);

  await copySourceObjects(source, r2Key);

  const media = await registerMedia({
    ownerId: userId,
    r2Key,
    width: source.width,
    height: source.height,
    durationMs: source.durationMs,
    // WARN: Carried across, and this is the one path that has to. `copySourceObjects` duplicates the `_thumb` object byte for byte, so the source's placeholder describes the copy exactly — and the bytes never pass through a client that could encode a replacement (§ 9.), so dropping it leaves a background with no placeholder forever.
    blurhash: source.blurhash,
    scope,
  });

  // WARN: Told apart from `unreachable` deliberately. Both used to answer the caller `null`, so a copy whose registration failed § 14. was reported as a source that does not exist — and the two objects it had already put in the bucket were attributable to nothing. This branch is the only record that they are there.
  return media ? { status: "copied", media } : { status: "unregistered" };
}

/**
 * INFO: REQUIREMENTS.md § 12.1. A library video reaches the caps by being trimmed
 * on the way in; one already in the conversation was never bounded by them, so a
 * copy is refused rather than silently worn.
 *
 * WARN: The rule itself is `isWearableBackgroundVideo` in `shared/config`, shared with the § 7.10. viewer — the control there is drawn from the same caps and the two used to state them separately.
 */
function isWearableSource(source: Media): boolean {
  return isWearableBackgroundVideo({ sizeBytes: source.size, durationMs: source.durationMs });
}

/**
 * WARN: Both keys, and the thumbnail is not optional. `registerMedia` refuses a
 * registration whose `_thumb` sibling is missing (§ 9.), so copying the original
 * alone would leave a key in the bucket that nothing can ever point at.
 */
async function copySourceObjects(source: Media, r2Key: string): Promise<void> {
  await Promise.all([
    copyObject(source.r2Key, r2Key),
    copyObject(toThumbKey(source.r2Key), toThumbKey(r2Key)),
  ]);
}
