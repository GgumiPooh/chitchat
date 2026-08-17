import "server-only";

import type { EmoticonPackType } from "@/shared/config";
import { emoticonItems, emoticonPacks, getDb, messages, nextSnowflake } from "@/shared/db";
import type { EmoticonItemId, EmoticonPackId, Nullable } from "@/shared/lib";
import { and, arrayOverlaps, eq } from "drizzle-orm";
import type { EmoticonPackSummary } from "../model/types";
import { detachEmoticonMedia, findItemSlotKeys } from "./get-emoticon-asset";

/**
 * REQUIREMENTS.md § 13.4. A title is the whole form. An empty pack is a valid
 * state on purpose: the thumbnail is one of the pack's own items (§ 13.2.), so it
 * cannot be chosen until items exist.
 *
 * INFO: The finished restructure. It takes no author. `created_by` recorded one and nothing
 * ever read it — § 13.1.'s "a record, never a permission check" was true of the column
 * and of the parameter alike, and a pack belongs to the conversation rather than to
 * whoever typed its name.
 *
 * WARN: § 13. The kind is settled here and nowhere else. Nothing may change it
 * afterwards: the keyword index is maintained per item, so a pack that changed kind
 * would strand every index row its items had already written (`0045`).
 */
export async function createEmoticonPack(
  name: string,
  type: EmoticonPackType,
): Promise<EmoticonPackSummary> {
  // INFO: § 13.1. No prefs row, which is what makes the pack hidden — it is turned on from 이모티콘 묶음 검색 once it is worth showing.
  const [row] = await getDb()
    .insert(emoticonPacks)
    .values({ id: nextSnowflake<EmoticonPackId>(), name, type })
    .returning();

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    thumbnailItemId: row.thumbnailItemId,
    thumbnailVersion: null,
    itemCount: 0,
    isEnabled: false,
  };
}

/** INFO: REQUIREMENTS.md § 13.1. No `created_by` check — a pack belongs to the conversation, not to whoever made it. */
export async function renameEmoticonPack(packId: EmoticonPackId, name: string): Promise<boolean> {
  const updated = await getDb()
    .update(emoticonPacks)
    .set({ name })
    .where(eq(emoticonPacks.id, packId))
    .returning({ id: emoticonPacks.id });

  return updated.length > 0;
}

/**
 * WARN: Scoped to the pack's own items. Without the `pack_id` half, the FK alone
 * would happily let one pack borrow another's item as its tab icon, and deleting
 * that pack would then blank an icon belonging to a pack nobody touched.
 */
export async function setEmoticonPackThumbnail(
  packId: EmoticonPackId,
  itemId: Nullable<EmoticonItemId>,
): Promise<boolean> {
  if (itemId) {
    const [item] = await getDb()
      .select({ id: emoticonItems.id })
      .from(emoticonItems)
      .where(and(eq(emoticonItems.id, itemId), eq(emoticonItems.packId, packId)))
      .limit(1);

    if (!item) {
      return false;
    }
  }

  const updated = await getDb()
    .update(emoticonPacks)
    .set({ thumbnailItemId: itemId })
    .where(eq(emoticonPacks.id, packId))
    .returning({ id: emoticonPacks.id });

  return updated.length > 0;
}

export type DeleteEmoticonPackResult =
  { status: "deleted"; orphanedKeys: string[] } | { status: "in_use" } | { status: "not_found" };

/**
 * Removes a pack and reports the R2 keys it leaves behind, so the caller can clean
 * the bucket (§ 9.).
 *
 * WARN: Refused when any of its items has been sent. The cascade reaches
 * `emoticon_items`, but `messages.emoticon_item_id` carries none — so without this
 * the delete surfaces a foreign-key error as a 500, and the alternative (deleting
 * the messages too) is § 18. #1's open question rather than something to decide here.
 *
 * WARN: § 13. An item written into a message's text is refused by the **second**
 * check, and it needs one because there is no constraint behind it — `pack_id`
 * cascades, so the rows would simply go, and a bubble drawing one reads its box off the
 * row that is no longer there. The item delete tombstones for that reason; a pack
 * delete cannot, since keeping the items means keeping the pack.
 */
export async function deleteEmoticonPack(
  packId: EmoticonPackId,
): Promise<DeleteEmoticonPackResult> {
  const [pack] = await getDb()
    .select({ id: emoticonPacks.id })
    .from(emoticonPacks)
    .where(eq(emoticonPacks.id, packId))
    .limit(1);

  if (!pack) {
    return { status: "not_found" };
  }

  const [sent] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(emoticonItems, eq(emoticonItems.id, messages.emoticonItemId))
    .where(eq(emoticonItems.packId, packId))
    .limit(1);

  if (sent) {
    return { status: "in_use" };
  }

  const items = await getDb()
    .select({ id: emoticonItems.id })
    .from(emoticonItems)
    .where(eq(emoticonItems.packId, packId));

  if (await isAnyItemInlined(items.map((item) => item.id))) {
    return { status: "in_use" };
  }

  // WARN: Read before the delete, for the reason `deleteEmoticonItem` gives — the keys live on the `media` rows the slots name, and the join needs the item rows to still be there.
  const slotKeys = await findItemSlotKeys(items.map((item) => item.id));

  await getDb().transaction(async (tx) => {
    // WARN: The thumbnail FK points into the items about to cascade away. Clearing it first keeps the delete from depending on constraint evaluation order.
    await tx
      .update(emoticonPacks)
      .set({ thumbnailItemId: null })
      .where(eq(emoticonPacks.id, packId));

    await tx.delete(emoticonPacks).where(eq(emoticonPacks.id, packId));

    await detachEmoticonMedia(tx, slotKeys);
  });

  return { status: "deleted", orphanedKeys: slotKeys };
}

/**
 * Whether any of these items is written into a message's text (§ 13.).
 *
 * WARN: `&&` against `inline_emoticon_item_ids`, which has no index and cannot get a
 * useful one — the id is an array element. It is a sequential scan of `messages`, paid
 * once on an explicit delete, and it is what keeps a tombstone's box from being
 * cascaded away.
 */
async function isAnyItemInlined(itemIds: EmoticonItemId[]): Promise<boolean> {
  if (itemIds.length === 0) {
    return false;
  }

  const [inlined] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(arrayOverlaps(messages.inlineEmoticonItemIds, itemIds))
    .limit(1);

  return inlined !== undefined;
}
