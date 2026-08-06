import type { GalleryMedia } from "@/entities/media";
import { MEDIA_COPY_PATH } from "@/shared/config";

/**
 * REQUIREMENTS.md § 12.1. Lifts a photo that is already in the conversation into
 * the caller's own `background/` scope, and answers the new `media` row.
 *
 * INFO: A copy rather than a reference. Pointing a background column at a `chat/`
 * object would put § 12.'s replacement cleanup in front of a photo a bubble still
 * renders, and would make deleting that photo from the gallery silently strip the
 * background too — the copy is what makes a background survive its source.
 */
export async function copyToBackground(sourceId: string): Promise<GalleryMedia> {
  const response = await fetch(MEDIA_COPY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_COPY_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: GalleryMedia };

  return media;
}
