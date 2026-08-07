import type { ChatMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl } from "@/shared/config";
import type { MediaCell } from "@/shared/ui";

export function toCellsFromMedia(media: ChatMedia[]): MediaCell[] {
  return media.map((item) => ({
    // INFO: REQUIREMENTS.md § 9.1. A file has no `_thumb` object, so it is given no URL to load rather than one that answers 404 behind every card.
    previewUrl: item.filename ? null : toMediaUrl(item.id),
    originalUrl: toMediaUrl(item.id, "original"),
    downloadUrl: toMediaDownloadUrl(item.id),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    isVideo: isVideoMime(item.mime),
    filename: item.filename,
    sizeBytes: item.size,
    id: item.id,
  }));
}

export function toCellsFromDrafts(drafts: MediaDraft[]): MediaCell[] {
  return drafts.map((draft) => ({
    previewUrl: draft.previewUrl,
    originalUrl: null,
    downloadUrl: null,
    width: draft.width,
    height: draft.height,
    durationMs: draft.durationMs,
    isVideo: isVideoMime(draft.mime),
    filename: draft.filename,
    // INFO: The picked file's own size — an optimistic card names the same figure the sent one will.
    sizeBytes: draft.file.size,
    id: draft.id,
  }));
}
