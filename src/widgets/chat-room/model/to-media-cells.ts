import type { ChatMedia, ChatTrackMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl, toVoiceTrack } from "@/shared/config";
import type { Optional } from "@/shared/lib";
import type { MediaCell } from "@/shared/ui";

/**
 * REQUIREMENTS.md § 8.1. Which bubble carries one slide of the § 7.10. viewer's
 * track, and who sent it.
 */
export type TrackOwner = { messageId: number; senderId: string };

export function toCellsFromMedia(media: ChatMedia[]): MediaCell[] {
  return media.map((item) => ({
    // INFO: REQUIREMENTS.md § 9.1., § 9.3. Neither a file nor a recording has a `_thumb` object, so both are given no URL to load rather than one that answers 404 behind every card.
    previewUrl: item.filename || item.voice ? null : toMediaUrl(item.id),
    blurhash: item.blurhash,
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

/**
 * REQUIREMENTS.md § 8.1. The conversation-wide track as the viewer renders it.
 *
 * INFO: `toCellsFromMedia` does the whole mapping — a track row *is* a `ChatMedia` plus the columns below.
 * INFO: DESIGN.md § 7.10. `toSenderName` rather than a name on the row. The wire carries `senderId`, and the room already holds the participants it resolves against (§ 8.7.) — a name projected per slide would be the same string repeated a thousand times and stale the moment either person renames.
 */
export function toCellsFromTrack(
  track: ChatTrackMedia[],
  toSenderName: (senderId: string) => Optional<string>,
): MediaCell[] {
  return toCellsFromMedia(track).map((cell, index) => {
    const row = track[index];

    return {
      ...cell,
      messageId: row?.messageId ?? null,
      sentAt: row?.createdAt ?? null,
      senderName: row ? (toSenderName(row.senderId) ?? null) : null,
    };
  });
}

/** REQUIREMENTS.md § 8.1. Which bubble each slide of the conversation-wide track belongs to. */
export function toTrackOwners(track: ChatTrackMedia[]): Map<string, TrackOwner> {
  return new Map(
    track.map(({ messageId, senderId, id }) => [id, { messageId, senderId }] as const),
  );
}

/**
 * REQUIREMENTS.md § 8.1. The same map for the bubble the viewer opened on, before
 * the conversation-wide track arrives.
 *
 * INFO: One bubble is one sender and one message (§ 6.), so every cell in it shares the same owner.
 */
export function toBubbleOwners(
  cells: MediaCell[],
  messageId: number,
  senderId: string,
): Map<string, TrackOwner> {
  return new Map(cells.map((cell) => [cell.id, { messageId, senderId }] as const));
}

export function toCellsFromDrafts(drafts: MediaDraft[]): MediaCell[] {
  return drafts.map((draft) => ({
    previewUrl: draft.previewUrl,
    // INFO: Null although the draft holds one — the preview above is a local blob, so a hash would be decoded, upscaled and handed to the compositor to race an image that reaches the screen without a network at all.
    blurhash: null,
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
