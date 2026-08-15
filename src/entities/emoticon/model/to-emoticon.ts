import type { EmoticonItem } from "@/shared/db";
import type { Emoticon } from "./types";

/** One item and the box its image slots resolve to, as `selectEmoticons` reads it. */
export type EmoticonRow = {
  item: EmoticonItem;
  width: number;
  height: number;
};

/**
 * WARN: Projects an explicit shape rather than spreading the row. An R2 key MUST NOT
 * reach the browser — nothing addresses R2 by key (REQUIREMENTS.md § 13.3.), and a
 * key on the wire is a key someone can ask `POST /api/emoticons/items` to claim.
 */
export function toEmoticon({ item, width, height }: EmoticonRow): Emoticon {
  return {
    id: item.id,
    packId: item.packId,
    width,
    height,
    hasAudio: item.audioId !== null,
    hasStill: item.stillImageId !== null,
    hasAnimated: item.animatedImageId !== null,
    keywords: item.keywords,
    version: item.updatedAt.getTime(),
  };
}
