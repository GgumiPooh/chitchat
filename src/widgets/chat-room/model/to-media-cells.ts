import type { ChatMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl } from "@/shared/config";
import type { MediaCell } from "@/shared/ui";

export function toCellsFromMedia(media: ChatMedia[]): MediaCell[] {
  return media.map((item) => ({
    previewUrl: toMediaUrl(item.id),
    originalUrl: toMediaUrl(item.id, "original"),
    downloadUrl: toMediaDownloadUrl(item.id),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    isVideo: isVideoMime(item.mime),
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
    id: draft.id,
  }));
}
