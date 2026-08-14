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
 *
 * WARN: RESTRUCTURE.md § 1.1. All three image slots resolve to the one stored object
 * for now, and that is the interim answer rather than a `?:` that happens to work.
 * § 5.2.'s columns exist and are empty, so `still-image` has nothing of its own to
 * return until § 5.'s code phase fills them and § 5.5.'s backfill reaches the items
 * already stored. When they do, this becomes the fallback **both ways** — a missing
 * still serves the animation and a missing animation serves the still — so that no
 * render path ever has to branch on what an item happens to carry.
 *
 * WARN: § 5.7. `isFallback` is what the asset route reads to shorten its cache, and it
 * is the whole of that trap: an answer from the other slot must not be held for the days
 * a versioned URL earns, or the still § 5.5. is about to write is invisible for a week to
 * every browser that asked once. It reports the slot that **answered**, not the slot that
 * was asked for.
 */
export function toSlotAsset(row: EmoticonItem, slot: EmoticonSlot): Nullable<ResolvedSlotAsset> {
  if (slot === "audio") {
    return row.audioKey ? { key: row.audioKey, isFallback: false } : null;
  }

  // INFO: § 5.2. Until the columns are filled there is one image object, so a request for the still is answered by the animation — which is a fallback, and says so.
  return { key: row.r2Key, isFallback: slot === "still-image" };
}

export type ResolvedSlotAsset = {
  key: string;
  /** RESTRUCTURE.md § 5.7. The asset came from a slot other than the one asked for. */
  isFallback: boolean;
};

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
