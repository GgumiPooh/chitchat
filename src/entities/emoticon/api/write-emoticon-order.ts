import type { EmoticonItemId, EmoticonPackId } from "@/shared/lib";
import "server-only";

import { emoticonItems, getDb } from "@/shared/db";
import { asc, eq, sql } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 13.1. Item order is **shared**, not per-user — this writes
 * `emoticon_items.sort_order` itself rather than a preference row, so both
 * participants see the pack in the order it was arranged in.
 *
 * Answers `false` when the ids are not exactly this pack's items: a partial list
 * would renumber some rows and leave the rest on their old positions, which is a
 * worse state than the reorder simply failing.
 */
export async function setEmoticonItemOrder(
  packId: EmoticonPackId,
  itemIds: EmoticonItemId[],
): Promise<boolean> {
  const current = await getDb()
    .select({ id: emoticonItems.id })
    .from(emoticonItems)
    .where(eq(emoticonItems.packId, packId))
    .orderBy(asc(emoticonItems.sortOrder));

  const requested = new Set(itemIds);

  if (current.length !== itemIds.length || current.some((item) => !requested.has(item.id))) {
    return false;
  }

  // INFO: One statement for the whole pack — a row per UPDATE would leave the list half-renumbered if the connection dropped between two of them.
  const positions = sql.join(
    itemIds.map((id, index) => sql`when ${emoticonItems.id} = ${id} then ${index}::smallint`),
    sql` `,
  );

  // WARN: The `else` is not decoration. The completeness check above is its own statement, so an item inserted between the two is caught by the `where` and missed by the `case` — without it `sort_order` would evaluate to NULL and surface as a 500 instead of the 409 the caller answers with.
  await getDb()
    .update(emoticonItems)
    .set({ sortOrder: sql`case ${positions} else ${emoticonItems.sortOrder} end` })
    .where(eq(emoticonItems.packId, packId));

  return true;
}
