import "server-only";

import { isImageMime, type MediaUploadScope } from "@/shared/config";
import type { Media } from "@/shared/db";
import { buildStorageKey, copyObject, toThumbKey } from "@/shared/storage";
import type { GalleryMedia } from "../model/types";
import { canReadMedia, getMediaRow } from "./get-media-object";
import { registerMedia } from "./register-media";

export type CopyMediaIntoScopeParams = {
  sourceId: string;
  /** The caller, who becomes the copy's owner — the copy is theirs however the source got there. */
  userId: string;
  scope: MediaUploadScope;
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
  | { status: "copied"; media: GalleryMedia }
  | { status: "unreachable" }
  | { status: "unsupported" }
  | { status: "unregistered" };

/**
 * Duplicates a `media` row and its two R2 objects into `scope`, under `userId`.
 *
 * INFO: REQUIREMENTS.md § 12.1. This is 배경으로 설정 — the route from a photo in
 * the gallery or a chat bubble to a background. Pointing the column at the source
 * row would have been free, and is what § 12. rules out: every pipeline's objects
 * stay inside their own scope, so that the replacement cleanup can delete them
 * without ever standing in front of a bubble that is still rendering one.
 *
 * WARN: `canReadMedia`, not ownership. The gallery and the conversation are shared
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
}: CopyMediaIntoScopeParams): Promise<CopyMediaResult> {
  const source = await getMediaRow(sourceId);

  if (!source || !(await canReadMedia(source, userId))) {
    return { status: "unreachable" };
  }

  // WARN: REQUIREMENTS.md § 12.1. The viewer hides 배경으로 설정 on a video, but that is a client-side decision and this route is reachable without it. A video worn as a background is drawn into a `PreloadImage`, which fails, retries once and settles on the broken-asset glyph — in front of the other participant, since a cover is published. It would also have duplicated up to `MAX_VIDEO_SIZE` of objects to get there.
  if (!isImageMime(source.mime)) {
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
  });

  // WARN: Told apart from `unreachable` deliberately. Both used to answer the caller `null`, so a copy whose registration failed § 14. was reported as a source that does not exist — and the two objects it had already put in the bucket were attributable to nothing. This branch is the only record that they are there.
  return media ? { status: "copied", media } : { status: "unregistered" };
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
