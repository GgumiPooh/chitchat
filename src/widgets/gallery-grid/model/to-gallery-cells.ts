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
    // INFO: REQUIREMENTS.md § 9.1. Carried rather than nulled, so the cell says what it is. The gallery query already excludes file attachments, and a source that ever stops doing so should render the § 6.5. card instead of a tile whose thumbnail does not exist.
    filename: item.filename,
    sizeBytes: item.size,
    id: item.id,
  }));
}
