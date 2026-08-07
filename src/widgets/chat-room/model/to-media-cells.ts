import type { ChatMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl, toVoiceTrack } from "@/shared/config";
import type { MediaCell } from "@/shared/ui";

export function toCellsFromMedia(media: ChatMedia[]): MediaCell[] {
  return media.map((item) => ({
    // INFO: REQUIREMENTS.md § 9.1., § 9.3. Neither a file nor a recording has a `_thumb` object, so both are given no URL to load rather than one that answers 404 behind every card.
    previewUrl: item.filename || item.voice ? null : toMediaUrl(item.id),
    originalUrl: toMediaUrl(item.id, "original"),
    downloadUrl: toMediaDownloadUrl(item.id),
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    isVideo: isVideoMime(item.mime),
    filename: item.filename,
    // INFO: § 9.3. Already `0`–`1` — `toChatMedia` converted it off the column's integer scale, and this is the same object the player draws from.
    voice: item.voice,
    sizeBytes: item.size,
    id: item.id,
  }));
}

export function toCellsFromDrafts(drafts: MediaDraft[]): MediaCell[] {
  return drafts.map((draft) => ({
    previewUrl: draft.previewUrl,
    // WARN: REQUIREMENTS.md § 9.3. A recording is the one draft that hands over an original, because a voice bubble is playable while it uploads and the local blob is the only source there is. Everything else has no full-size object until the upload registers, and a photo's own preview is a thumbnail rather than one.
    originalUrl: draft.waveformPeaks ? draft.previewUrl : null,
    downloadUrl: null,
    width: draft.width,
    height: draft.height,
    durationMs: draft.durationMs,
    isVideo: isVideoMime(draft.mime),
    filename: draft.filename,
    // INFO: § 9.3. Converted here rather than stored converted — a draft carries the wire form the upload sends, and `toVoiceTrack` is the one place the scale is crossed.
    voice: toVoiceTrack(draft.waveformPeaks),
    // INFO: The picked file's own size — an optimistic card names the same figure the sent one will.
    sizeBytes: draft.file.size,
    id: draft.id,
  }));
}
