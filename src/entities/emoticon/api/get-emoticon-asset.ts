import "server-only";

import type { EmoticonSlot } from "@/shared/config";
import { emoticonItems, getDb, media, messages, type EmoticonItem } from "@/shared/db";
import type { EmoticonItemId, Nullable } from "@/shared/lib";
import { eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * One item and the storage key behind each of its slots (the finished restructure).
 *
 * WARN: The keys are joined rather than read off the item, because § 5.2. moved them onto
 * `media` rows. The item's own `r2_key` and `audio_key` are still here and still carry the
 * pre-§ 5. objects, which is what `toSlotAsset` falls back to — migration D is what makes
 * the join the only source.
 */
export type EmoticonItemAssets = {
  item: EmoticonItem;
  stillKey: Nullable<string>;
  animatedKey: Nullable<string>;
  audioKey: Nullable<string>;
};

export async function getEmoticonItem(id: EmoticonItemId): Promise<Nullable<EmoticonItemAssets>> {
  const still = alias(media, "still_media");
  const animated = alias(media, "animated_media");
  const audio = alias(media, "audio_media");

  const [row] = await getDb()
    .select({
      item: emoticonItems,
      stillKey: still.r2Key,
      animatedKey: animated.r2Key,
      audioKey: audio.r2Key,
    })
    .from(emoticonItems)
    // WARN: Three `leftJoin`s and never an inner one — every slot is nullable (§ 5.2.), so an inner join drops the very items this is asked about.
    .leftJoin(still, eq(still.id, emoticonItems.stillImageId))
    .leftJoin(animated, eq(animated.id, emoticonItems.animatedImageId))
    .leftJoin(audio, eq(audio.id, emoticonItems.audioId))
    .where(eq(emoticonItems.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * The R2 key behind one slot, or `null` when the item does not carry that slot.
 *
 * INFO: REQUIREMENTS.md § 13.3. There is no per-object authorization to do here.
 * A pack belongs to the conversation (§ 13.1.), so a valid session is the whole
 * check — unlike `canReadMedia`, whose scopes reach objects nobody has posted.
 *
 * WARN: The finished restructure. **The fallback runs both ways** — a missing still is answered
 * by the animation and a missing animation by the still — which is what lets an author
 * register only one slot without a single render path branching on what an item carries.
 *
 * WARN: § 5.7. `isFallback` is what the asset route reads to shorten its cache, and it
 * is the whole of that trap: an answer from the other slot must not be held for the days
 * a versioned URL earns, or a still written later is invisible for a week to every
 * browser that asked once. It reports the slot that **answered**, not the one asked for.
 *
 * INFO: The item's own `r2_key` is the last resort on both image slots and `audio_key` on
 * the sound. Those columns are pre-§ 5. and still authoritative for anything the § 5.5.
 * backfill has not reached; migration D is what removes them and this line with them.
 */
export function toSlotAsset(
  { item, stillKey, animatedKey, audioKey }: EmoticonItemAssets,
  slot: EmoticonSlot,
): Nullable<ResolvedSlotAsset> {
  if (slot === "audio") {
    const key = audioKey ?? item.audioKey;

    return key ? { key, isFallback: false } : null;
  }

  // WARN: § 5.7. `image` is the deprecated alias and means the **animated** slot, which is what it has always meant — a tab left open across the deploy goes on asking for it.
  const wants = slot === "still-image" ? stillKey : (animatedKey ?? item.r2Key);
  const other = slot === "still-image" ? (animatedKey ?? item.r2Key) : stillKey;
  const key = wants ?? other;

  return key ? { key, isFallback: wants === null } : null;
}

export type ResolvedSlotAsset = {
  key: string;
  /** The finished restructure. The asset came from a slot other than the one asked for. */
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
 * INFO: The finished restructure. An item that has been sent is **retired** rather than
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
