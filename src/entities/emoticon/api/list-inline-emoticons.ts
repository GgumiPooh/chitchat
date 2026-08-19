import "server-only";

import type { InlineEmoticonMap } from "@/shared/config";
import { emoticonItems } from "@/shared/db";
import type { EmoticonItemId } from "@/shared/lib";
import { inArray } from "drizzle-orm";
import { selectEmoticons } from "./select-emoticons";

/**
 * The emoticons standing inside a page of message text, keyed by item id
 * (REQUIREMENTS.md § 13.).
 *
 * WARN: One query for the whole page and the ids deduplicated first — a page repeats
 * an emoticon freely, and this is the read that would otherwise be run per placeholder.
 *
 * WARN: A deleted item is **answered**, not filtered out. Its row and its box outlive
 * its objects precisely so the message it was written into still knows how much space
 * to leave; dropped here, every bubble holding one would re-wrap around a missing id.
 */
export async function listInlineEmoticons(
  itemIds: readonly EmoticonItemId[],
): Promise<InlineEmoticonMap> {
  const distinct = [...new Set(itemIds)];
  const byId: InlineEmoticonMap = {};

  if (distinct.length === 0) {
    return byId;
  }

  const rows = await selectEmoticons().where(inArray(emoticonItems.id, distinct));

  for (const { item, width, height } of rows) {
    byId[item.id] = {
      width,
      height,
      version: item.updatedAt.getTime(),
      hasAudio: item.audioId !== null,
      // INFO: REQUIREMENTS.md § 13. One keyword is the item's name; the § 16.1. push body and the § 8.10. quote read it when the message has no words of its own left.
      name: item.keywords[0] ?? null,
      isDeleted: item.deletedAt !== null,
    };
  }

  return byId;
}
