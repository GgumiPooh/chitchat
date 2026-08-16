import "server-only";

import { listInlineEmoticons } from "@/entities/emoticon/@x/message";
import type { EmoticonItemId } from "@/shared/lib";

/**
 * Whether every id names an item that exists (REQUIREMENTS.md § 13.).
 *
 * WARN: `inline_emoticon_item_ids` carries no foreign key — Postgres constrains no
 * array element — so nothing but this stops a stale client writing ids that resolve
 * to nothing. It is the same 400 `mediaIds` and `emoticonItemId` get from their own
 * checks, which those two only get for free because a foreign key would 500 instead.
 *
 * INFO: A deleted item passes. Its row is kept precisely so a message already holding
 * it still resolves a box (§ 13.), and the picker cannot offer one — so an id that
 * arrives here naming a deleted item is a race with the other participant's delete,
 * not a body to refuse.
 */
export async function areInlineEmoticonsKnown(
  itemIds: readonly EmoticonItemId[],
): Promise<boolean> {
  const distinct = [...new Set(itemIds)];

  if (distinct.length === 0) {
    return true;
  }

  const known = await listInlineEmoticons(distinct);

  return distinct.every((itemId) => known[itemId] !== undefined);
}
