import "server-only";

import type { EmoticonSlot } from "@/shared/config";
import { emoticonItems, getDb, messages, type EmoticonItem } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { eq, inArray, or } from "drizzle-orm";

export async function getEmoticonItem(id: string): Promise<Nullable<EmoticonItem>> {
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
  { status: "deleted"; orphanedKeys: string[] } | { status: "in_use" } | { status: "not_found" };

/**
 * Removes an item and reports the R2 keys it leaves behind, so the caller can
 * clean the bucket (§ 9.).
 *
 * WARN: An item already sent in chat is refused. `messages.emoticon_item_id`
 * carries no cascade, so deleting it would surface a foreign-key error as a 500 —
 * and deciding what an already-sent bubble becomes is § 18. #1's open question,
 * not something to settle silently here.
 */
export async function deleteEmoticonItem(id: string): Promise<DeleteEmoticonResult> {
  const [sent] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.emoticonItemId, id))
    .limit(1);

  if (sent) {
    return { status: "in_use" };
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
