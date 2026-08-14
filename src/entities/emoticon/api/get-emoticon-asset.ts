import "server-only";

import type { EmoticonSlot } from "@/shared/config";
import { emoticonItems, getDb, messages, type EmoticonItem } from "@/shared/db";
import type { EmoticonItemId, Nullable } from "@/shared/lib";
import { eq, inArray, or } from "drizzle-orm";

export async function getEmoticonItem(id: EmoticonItemId): Promise<Nullable<EmoticonItem>> {
  const [row] = await getDb().select().from(emoticonItems).where(eq(emoticonItems.id, id)).limit(1);

  return row ?? null;
}

/**
 * The R2 key behind one slot, or `null` when the item does not carry that slot.
 *
 * INFO: REQUIREMENTS.md § 13.3. There is no per-object authorization to do here.
 * A pack belongs to the conversation (§ 13.1.), so a valid session is the whole
 * check — unlike `canReadMedia`, whose scopes reach objects nobody has posted.
 */
export function toSlotKey(row: EmoticonItem, slot: EmoticonSlot): Nullable<string> {
  return slot === "audio" ? row.audioKey : row.r2Key;
}

/**
 * The subset of `keys` that no item references, which is exactly the set that may
 * be deleted from the bucket without taking an emoticon down with it (§ 13.3.).
 */
export async function listUnregisteredEmoticonKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select({ r2Key: emoticonItems.r2Key, audioKey: emoticonItems.audioKey })
    .from(emoticonItems)
    .where(or(inArray(emoticonItems.r2Key, keys), inArray(emoticonItems.audioKey, keys)));

  const registered = new Set(rows.flatMap((row) => [row.r2Key, row.audioKey]));

  return keys.filter((key) => !registered.has(key));
}

export type DeleteEmoticonResult =
  { status: "deleted"; orphanedKeys: string[] } | { status: "retired" } | { status: "not_found" };

/**
 * Takes an item out of the picker, and removes it outright where nothing has sent it —
 * reporting the R2 keys that leaves behind so the caller can clean the bucket (§ 9.).
 *
 * INFO: RESTRUCTURE.md § 4.4. An item that has been sent is **retired** rather than
 * refused. It leaves the picker, search and 최근 사용, and every bubble that already
 * carries it renders exactly as before. This used to answer `in_use` and the control
 * simply failed, which is the complaint this resolves.
 *
 * WARN: § 4.4. Retiring is the whole of it, and neither the FK nor the CHECK behind it
 * is touched. `messages.emoticon_item_id` carries no cascade and
 * `messages_type_payload_check` forbids the `set null` that would otherwise let the row
 * go — deliberately, because an emoticon is shared vocabulary rather than one person's
 * record, so erasing one would put a tombstone in **both** participants' bubbles with no
 * author to attribute it to.
 *
 * WARN: § 4.1. Either participant may do this, unlike a media delete. The picker is
 * shared, and retiring changes no bubble.
 */
export async function deleteEmoticonItem(id: EmoticonItemId): Promise<DeleteEmoticonResult> {
  const [sent] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.emoticonItemId, id))
    .limit(1);

  if (sent) {
    const [retired] = await getDb()
      .update(emoticonItems)
      .set({ retiredAt: new Date() })
      .where(eq(emoticonItems.id, id))
      .returning({ id: emoticonItems.id });

    return retired ? { status: "retired" } : { status: "not_found" };
  }

  const [row] = await getDb()
    .delete(emoticonItems)
    .where(eq(emoticonItems.id, id))
    .returning({ r2Key: emoticonItems.r2Key, audioKey: emoticonItems.audioKey });

  if (!row) {
    return { status: "not_found" };
  }

  return {
    status: "deleted",
    orphanedKeys: [row.r2Key, row.audioKey].filter((key): key is string => key !== null),
  };
}
