import type { ChatMedia, ChatTrackMedia, MediaDraft } from "@/entities/media";
import { isVideoMime, toMediaDownloadUrl, toMediaUrl, toVoiceTrack } from "@/shared/config";
import {
  idToDate,
  toId,
  type MediaId,
  type MessageId,
  type Optional,
  type UserId,
} from "@/shared/lib";
import type { MediaCell } from "@/shared/ui";

/**
 * REQUIREMENTS.md § 8.1. Which bubble carries one slide of the § 7.10. viewer's
 * track, and who sent it.
 */
export type TrackOwner = { messageId: MessageId; senderId: UserId };

// INFO: REQUIREMENTS.md § 16.1. `onlyMe` is one flag for the whole call, never per item — § 6. keeps a bubble to one sender and one kind, so every cell built from one bubble's own `media` shares its message's flag.
export function toCellsFromMedia(media: ChatMedia[], onlyMe = false): MediaCell[] {
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
    isDeleted: item.isDeleted,
    onlyMe,
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
  toSenderName: (senderId: UserId) => Optional<string>,
): MediaCell[] {
  return toCellsFromMedia(track).map((cell, index) => {
    const row = track[index];

    return {
      ...cell,
      messageId: row?.messageId ?? null,
      // INFO: DESIGN.md § 7.10. and the finished restructure. The caption's instant comes off the slide's own id, which is where the track's order comes from too.
      sentAt: row ? idToDate(row.id).toISOString() : null,
      senderName: row ? (toSenderName(row.senderId) ?? null) : null,
      // WARN: REQUIREMENTS.md § 16.1. Overrides `toCellsFromMedia`'s shared default — the track crosses bubbles, and each row carries its own message's flag rather than the one this call was seeded with.
      onlyMe: row?.onlyMe ?? false,
    };
  });
}

/** REQUIREMENTS.md § 8.1. Which bubble each slide of the conversation-wide track belongs to. */
export function toTrackOwners(track: ChatTrackMedia[]): Map<MediaId, TrackOwner> {
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
  messageId: MessageId,
  senderId: UserId,
): Map<MediaId, TrackOwner> {
  return new Map(cells.map((cell) => [cell.id, { messageId, senderId }] as const));
}

export function toCellsFromDrafts(drafts: MediaDraft[]): MediaCell[] {
  return drafts.map((draft) => {
    const shared = {
      previewUrl: draft.previewUrl,
      width: draft.width,
      height: draft.height,
      durationMs: draft.durationMs,
      isVideo: isVideoMime(draft.mime),
      // INFO: The picked file's own size — an optimistic card names the same figure the sent one will.
      sizeBytes: draft.file.size,
      // INFO: The finished restructure. A draft names no row, so there is nothing that could have been deleted out from under it.
      isDeleted: false,
    };

    // INFO: REQUIREMENTS.md § 10. 채팅으로 보내기 — the row is already registered, so the cell draws from its real thumbnail/original and carries the id `MediaViewer` can actually open.
    if (draft.sourceMediaId) {
      return {
        ...shared,
        blurhash: draft.blurhash,
        originalUrl: toMediaUrl(draft.sourceMediaId, "original"),
        downloadUrl: toMediaDownloadUrl(draft.sourceMediaId),
        filename: null,
        voice: null,
        id: draft.sourceMediaId,
      };
    }

    return {
      ...shared,
      // INFO: Null although the draft holds one — the preview above is a local blob, so a hash would be decoded, upscaled and handed to the compositor to race an image that reaches the screen without a network at all.
      blurhash: null,
      // WARN: REQUIREMENTS.md § 9.3. A recording is the one draft that hands over an original, because a voice bubble is playable while it uploads and the local blob is the only source there is. Everything else has no full-size object until the upload registers, and a photo's own preview is a thumbnail rather than one.
      originalUrl: draft.waveformPeaks ? draft.previewUrl : null,
      downloadUrl: null,
      filename: draft.filename,
      // INFO: § 9.3. Converted here rather than stored converted — a draft carries the wire form the upload sends, and `toVoiceTrack` is the one place the scale is crossed.
      voice: toVoiceTrack(draft.waveformPeaks),
      // WARN: A local draft id worn as a `MediaId` — see `MediaCell.id`. It names no row and must never reach an endpoint.
      id: toId<MediaId>(draft.id),
    };
  });
}
