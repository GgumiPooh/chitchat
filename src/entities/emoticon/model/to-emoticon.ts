import type { EmoticonItem } from "@/shared/db";
import type { Emoticon } from "./types";

/**
 * WARN: Projects an explicit shape rather than spreading the row. `r2_key` and
 * `audio_key` MUST NOT reach the browser — nothing addresses R2 by key
 * (REQUIREMENTS.md § 13.3.), and a key on the wire is a key someone can ask
 * `POST /api/emoticons/items` to claim.
 */
export function toEmoticon(row: EmoticonItem): Emoticon {
  return {
    id: row.id,
    packId: row.packId,
    width: row.width,
    height: row.height,
    hasAudio: row.audioKey !== null,
    version: row.updatedAt.getTime(),
  };
}
