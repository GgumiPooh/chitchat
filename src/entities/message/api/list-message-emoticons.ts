import type { EmoticonItemId } from "@/shared/lib";
import "server-only";

import { selectEmoticons, toEmoticon, type Emoticon } from "@/entities/emoticon/@x/message";
import { emoticonItems } from "@/shared/db";
import { inArray } from "drizzle-orm";

/**
 * The emoticons for a whole page of messages, keyed by item id.
 *
 * INFO: REQUIREMENTS.md § 13.6. One query for the page, never one per message, for
 * the same reason `listMessageMedia` is one query. Keyed by *item* rather than by
 * message, because a page commonly repeats one emoticon several times.
 */
export async function listMessageEmoticons(
  itemIds: EmoticonItemId[],
): Promise<Map<string, Emoticon>> {
  const byId = new Map<string, Emoticon>();

  if (itemIds.length === 0) {
    return byId;
  }

  const rows = await selectEmoticons().where(inArray(emoticonItems.id, itemIds));

  for (const row of rows) {
    byId.set(row.item.id, toEmoticon(row));
  }

  return byId;
}
