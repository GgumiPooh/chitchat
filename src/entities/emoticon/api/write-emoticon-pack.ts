import "server-only";

import { emoticonItems, emoticonPacks, getDb, messages, nextSnowflake } from "@/shared/db";
import type { EmoticonItemId, EmoticonPackId, Nullable } from "@/shared/lib";
import { and, eq } from "drizzle-orm";
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
 */
export async function createEmoticonPack(name: string): Promise<EmoticonPackSummary> {
  const [row] = await getDb()
    .insert(emoticonPacks)
    .values({ id: nextSnowflake<EmoticonPackId>(), name })
    .returning();

  return {
    id: row.id,
    name: row.name,
    thumbnailItemId: row.thumbnailItemId,
    thumbnailVersion: null,
    itemCount: 0,
    isEnabled: true,
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
