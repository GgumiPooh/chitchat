import "server-only";

import type { EmoticonPackType } from "@/shared/config";
import { emoticonItems, emoticonPacks, getDb, nextSnowflake, userEmoticonPrefs } from "@/shared/db";
import type { EmoticonItemId, EmoticonPackId, Nullable, UserId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import type { EmoticonPackSummary } from "../model/types";
import { detachEmoticonMedia, findItemSlotKeys } from "./get-emoticon-asset";

/**
 * REQUIREMENTS.md § 13.4. A title is the whole form. An empty pack is a valid
 * state on purpose: the thumbnail is one of the pack's own items (§ 13.2.), so it
 * cannot be chosen until items exist. `created_by` is dropped and stores nothing —
 * a pack belongs to the conversation, not to whoever typed its name (§ 13.1.).
 *
 * WARN: § 13.1. `creatorId` writes only the creator's own `user_emoticon_prefs`
 * row, in the same transaction as the pack — the other participant gets none, so
 * the pack stays hidden for them until 이모티콘 묶음 검색 turns it on.
 *
 * WARN: § 13. The kind is settled here and nowhere else. Nothing may change it
 * afterwards: the keyword index is maintained per item, so a pack that changed kind
 * would strand every index row its items had already written (`0045`).
 */
export async function createEmoticonPack(
  name: string,
  type: EmoticonPackType,
  creatorId: UserId,
): Promise<EmoticonPackSummary> {
  const row = await getDb().transaction(async (tx) => {
    const [inserted] = await tx
      .insert(emoticonPacks)
      .values({ id: nextSnowflake<EmoticonPackId>(), name, type })
      .returning();

    await tx
      .insert(userEmoticonPrefs)
      .values({ userId: creatorId, packId: inserted.id, enabled: true });

    return inserted;
  });

  return {
    id: row.id,
    name: row.name,
    type: row.type,
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
    .where(and(eq(emoticonPacks.id, packId), isNull(emoticonPacks.deletedAt)))
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
      .where(
        and(
          eq(emoticonItems.id, itemId),
          eq(emoticonItems.packId, packId),
          isNull(emoticonItems.deletedAt),
        ),
      )
      .limit(1);

    if (!item) {
      return false;
    }
  }

  const updated = await getDb()
    .update(emoticonPacks)
    .set({ thumbnailItemId: itemId })
    .where(and(eq(emoticonPacks.id, packId), isNull(emoticonPacks.deletedAt)))
    .returning({ id: emoticonPacks.id });

  return updated.length > 0;
}

export type DeleteEmoticonPackResult =
  { status: "deleted"; orphanedKeys: string[] } | { status: "not_found" };

/**
 * Soft-deletes a pack and every one of its items in one transaction, and reports
 * the R2 keys that leaves behind so the caller can clean the bucket (§ 9., § 13.5.).
 *
 * WARN: Never a hard `DELETE`. The cascade into `emoticon_items` is exactly what
 * `messages.emoticon_item_id`'s missing FK cascade forbids, and it would also erase
 * the `width`/`height` a sent item's tombstone bubble sizes itself from.
 */
export async function deleteEmoticonPack(
  packId: EmoticonPackId,
): Promise<DeleteEmoticonPackResult> {
  const [pack] = await getDb()
    .select({ id: emoticonPacks.id })
    .from(emoticonPacks)
    .where(and(eq(emoticonPacks.id, packId), isNull(emoticonPacks.deletedAt)))
    .limit(1);

  if (!pack) {
    return { status: "not_found" };
  }

  const slotKeys = await getDb().transaction(async (tx) => {
    // WARN: Stamped by `pack_id` rather than by an id list read beforehand. A `POST /packs/{id}/items` committing between the two would land an item this delete never stamps, and no item-level read joins its pack — so it would stay reachable from 이모티콘 검색 and 즐겨찾기 with its objects already gone.
    const items = await tx
      .update(emoticonItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(emoticonItems.packId, packId), isNull(emoticonItems.deletedAt)))
      .returning({ id: emoticonItems.id });

    await tx
      .update(emoticonPacks)
      .set({ deletedAt: new Date() })
      .where(eq(emoticonPacks.id, packId));

    // INFO: Read inside the transaction, which a soft delete allows where the old hard one did not — the rows the join needs are still there, stamped.
    const keys = await findItemSlotKeys(
      items.map((item) => item.id),
      tx,
    );

    await detachEmoticonMedia(tx, keys);

    return keys;
  });

  return { status: "deleted", orphanedKeys: slotKeys };
}
