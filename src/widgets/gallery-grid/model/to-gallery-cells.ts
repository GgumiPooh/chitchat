import type { GalleryMedia } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl } from "@/shared/config";
import type { MediaCell } from "@/shared/ui";

/** What the tile and the viewer of DESIGN.md § 7.10. render one gallery row as. */
export function toGalleryCells(media: GalleryMedia[]): MediaCell[] {
  return media.map((item) => ({
    previewUrl: toMediaUrl(item.id),
    originalUrl: toMediaUrl(item.id, "original"),
    downloadUrl: toMediaDownloadUrl(item.id),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    isVideo: isVideoMime(item.mime),
    // INFO: REQUIREMENTS.md § 9.1. Carried rather than nulled, so the cell says what it is — 공유 and 저장 name the file by it.
    // WARN: The grid draws a thumbnail unconditionally, so `isInGallery`'s `filename IS NULL` is the only thing keeping a file attachment out of it. Relaxing that predicate needs the § 6.5. card here first; a file reaching a tile is a broken image, not a fallback.
    filename: item.filename,
    sizeBytes: item.size,
    id: item.id,
  }));
}
