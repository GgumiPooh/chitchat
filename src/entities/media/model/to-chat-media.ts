import { toVoiceTrack } from "@/shared/config";
import type { Media } from "@/shared/db";
import type { ChatMedia } from "./types";

// WARN: An explicit projection, not a spread — `r2_key` and `owner_id` are server-side identity and must not reach the browser.
export function toChatMedia(row: Media): ChatMedia {
  return {
    id: row.id,
    mime: row.mime,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    blurhash: row.blurhash,
    filename: row.filename,
    voice: toVoiceTrack(row.waveformPeaks),
    size: row.size,
  };
}
