import type { ChatMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/** One tile in a bubble's grid, from a stored row or from a draft still uploading. */
export type MediaCell = {
  /** What the grid tile shows — the stored thumbnail, or the draft's local preview. */
  previewUrl: string;
  // INFO: Null while the attachment is still a local draft. The viewer needs the full-size object, which does not exist until the upload is registered.
  originalUrl: Nullable<string>;
  /** The same object as `originalUrl`, signed to save rather than to display. */
  downloadUrl: Nullable<string>;
  width: number;
  height: number;
  durationMs: Nullable<number>;
  isVideo: boolean;
  id: string;
};

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
