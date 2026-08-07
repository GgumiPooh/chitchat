import "server-only";

import {
  MAX_FILE_SIZE,
  MAX_THUMBNAIL_SIZE,
  THUMBNAIL_MIME,
  isAllowedMediaMime,
  isFileMime,
  maxSizeForScope,
  toSafeFilename,
  type MediaUploadScope,
} from "@/shared/config";
import { getDb, media } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { headAcceptableObject, toThumbKey, type StoredObject } from "@/shared/storage";
import { and, eq } from "drizzle-orm";
import { toGalleryMedia } from "../model/to-gallery-media";
import type { GalleryMedia } from "../model/types";

export type RegisterMediaParams = {
  ownerId: string;
  r2Key: string;
  width: number;
  height: number;
  durationMs?: Nullable<number>;
  /** REQUIREMENTS.md § 9.1. What the file was picked as. Required of a file attachment and ignored for a photo or video, which are named by their type. */
  filename?: Nullable<string>;
  // INFO: REQUIREMENTS.md § 10. Set by an upload that starts in the Gallery tab. A chat attachment leaves it false and reaches the grid through the message it is sent in.
  addToGallery?: boolean;
  /** WARN: REQUIREMENTS.md § 12.1. Read from the key rather than trusted from the caller, and it narrows the size ceiling — a `background` video is bounded far below `MAX_VIDEO_SIZE`. */
  scope: MediaUploadScope;
};

/**
 * Turns an uploaded pair of objects into the row the rest of the app points at.
 *
 * WARN: This is where REQUIREMENTS.md § 14.'s type and size limits are actually
 * enforced. The upload went straight to R2 (§ 9.), so the server never saw the
 * bytes — it reads back what R2 stored and refuses to write a row for anything
 * outside the allow-list. Nothing without a row is reachable from the app.
 *
 * WARN: § 9.1. Whether this is a file attachment is decided **here**, from the
 * stored mime, and never from the caller's `filename`. The column is the
 * discriminator every other reader branches on, so letting a client set it would
 * let it file a JPEG out of the gallery, or claim a `.zip` was a photo and put an
 * undrawable row in the grid.
 */
export async function registerMedia({
  ownerId,
  r2Key,
  width,
  height,
  durationMs,
  filename,
  addToGallery = false,
  scope,
}: RegisterMediaParams): Promise<Nullable<GalleryMedia>> {
  // WARN: Both HEADs still go out together, including the one a file will not need. Deciding first would put the two round trips in series on the send path, and a miss on a key R2 holds nothing at costs a request rather than a correctness problem.
  const [object, thumbnail] = await Promise.all([
    headAcceptableObject(r2Key, isAcceptableObject(scope)),
    // WARN: The thumbnail is checked as strictly as the original. It is what every chat cell, grid tile and video poster loads, so an unchecked `_thumb` key is the same hole in § 14. by another name.
    headAcceptableObject(
      toThumbKey(r2Key),
      ({ mime, size }) => mime === THUMBNAIL_MIME && size <= MAX_THUMBNAIL_SIZE,
    ),
  ]);

  if (!object) {
    return null;
  }

  const isFile = isFileMime(object.mime);
  const storedName = isFile && filename ? toSafeFilename(filename) : null;

  // INFO: § 9.1. A file has no drawn box and no gallery tile, so the two things the gallery pipelines depend on are exactly what it must not claim: an avatar or a background cannot be one, and neither can a row filed straight into the grid.
  if (isFile && (scope !== "chat" || addToGallery || !storedName)) {
    return null;
  }

  // INFO: § 9.1. A file attachment has no sibling to require — nothing renders it, and `toVariantKey` never asks for a thumb variant of a row carrying a filename.
  if (!isFile && !thumbnail) {
    return null;
  }

  // WARN: REQUIREMENTS.md § 8.3. The route admits a zero only so a file can decline to measure a box it has not got. A photo or a video that arrives with one is refused here rather than stored: `toMediaBoxHeight` divides by `width` for a single attachment, so a `0` row makes the whole virtualized list resolve its total size to `NaN` and stop laying out.
  if (!isFile && (width <= 0 || height <= 0)) {
    return null;
  }

  const [row] = await getDb()
    .insert(media)
    .values({
      ownerId,
      r2Key,
      mime: object.mime,
      size: object.size,
      // WARN: § 9.1. Zeroed rather than trusted for a file. The client has no box to measure there, so whatever it sent is a guess the row would carry forever.
      width: isFile ? 0 : width,
      height: isFile ? 0 : height,
      durationMs: isFile ? null : (durationMs ?? null),
      filename: storedName,
      galleryAddedAt: addToGallery ? new Date() : null,
    })
    // INFO: `r2_key` is unique, so a retried registration returns the row the first attempt wrote instead of failing the send.
    .onConflictDoNothing({ target: media.r2Key })
    .returning();

  if (row) {
    return toGalleryMedia(row);
  }

  return getMediaByKey(r2Key, ownerId);
}

/**
 * INFO: § 9.1. A file is bounded by its own ceiling; a photo or a video keeps the
 * per-type one, which the scope may narrow further.
 *
 * WARN: The unrecognised type is refused as its own branch, never by handing back a
 * ceiling of `0`. The caller's test is `size <= ceiling`, and a zero-byte object
 * passes `0 <= 0` — which is reachable, since a presigned PUT enforces neither the
 * signed type nor any size (§ 9.), so a malformed mime could be stored under a key
 * whose `_thumb` sibling is a real JPEG and register as a photo.
 */
function isAcceptableObject(scope: MediaUploadScope) {
  return ({ mime, size }: StoredObject) => {
    if (isAllowedMediaMime(mime)) {
      return size <= maxSizeForScope(mime, scope);
    }

    return isFileMime(mime) && size <= MAX_FILE_SIZE;
  };
}

async function getMediaByKey(r2Key: string, ownerId: string): Promise<Nullable<GalleryMedia>> {
  const [existing] = await getDb()
    .select()
    .from(media)
    // WARN: Scoped to the owner for the same reason `createTextMessage` scopes its re-read — a conflict must never hand the caller a row that is not theirs.
    .where(and(eq(media.r2Key, r2Key), eq(media.ownerId, ownerId)))
    .limit(1);

  return existing ? toGalleryMedia(existing) : null;
}
