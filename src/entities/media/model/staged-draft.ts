import { toMediaUrl } from "@/shared/config";
import type { MediaDraft } from "./draft";
import type { ArchiveMedia } from "./types";

/**
 * REQUIREMENTS.md § 10. 채팅으로 보내기 — an `ArchiveMedia` row worn as a
 * `MediaDraft`, so the composer's tray, upload chain and optimistic bubble can all
 * take it exactly as they take a freshly picked attachment.
 *
 * WARN: `file` is an empty placeholder, never read for its bytes — `sourceMediaId`
 * is what tells the upload chain to skip this slot rather than PUT it.
 */
export function toStagedDraft(media: ArchiveMedia): MediaDraft {
  return {
    id: media.id,
    file: new File([], media.filename ?? media.id, { type: media.mime }),
    thumbnail: null,
    thumbnailMime: null,
    previewUrl: toMediaUrl(media.id, "thumb"),
    mime: media.mime,
    width: media.width ?? 0,
    height: media.height ?? 0,
    durationMs: media.durationMs,
    blurhash: media.blurhash,
    filename: null,
    waveformPeaks: null,
    sourceMediaId: media.id,
  };
}
