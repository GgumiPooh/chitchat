import type { ChatMedia } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import type { MediaCell } from "@/shared/ui";

/**
 * A stored attachment as the mirror draws it (REQUIREMENTS.md § 16.).
 *
 * WARN: Every URL is null, and that is the contract rather than an omission. The
 * objects behind them are never cached (§ 16.), so a cell carrying one would put a
 * broken `<img>` on screen where the hash already stands in for the picture.
 */
export function toMirrorCell(media: ChatMedia): MediaCell {
  return {
    previewUrl: null,
    blurhash: media.blurhash,
    originalUrl: null,
    downloadUrl: null,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    isVideo: isVideoMime(media.mime),
    filename: media.filename,
    sizeBytes: media.size,
    voice: media.voice,
    isDeleted: media.isDeleted,
    id: media.id,
  };
}
