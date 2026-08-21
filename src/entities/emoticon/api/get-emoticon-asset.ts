import "server-only";

import type { EmoticonSlot } from "@/shared/config";
import { emoticonItems, emoticonPacks, getDb, media } from "@/shared/db";
import type { EmoticonItemId, Nullable } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

/** The storage key behind each of one item's three slots (the finished restructure). */
export type EmoticonItemAssets = {
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
      stillKey: still.r2Key,
      animatedKey: animated.r2Key,
      audioKey: audio.r2Key,
    })
    .from(emoticonItems)
    // WARN: Three `leftJoin`s and never an inner one — every slot is nullable, so an inner join drops the very items this is asked about.
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
 * WARN: `isFallback` shortens the asset route's cache, and it is deliberately **not**
 * every fallback — only a missing **still**, which is a gap an author can close. A
 * missing animation is not a gap: a static emoticon is a whole emoticon and this is
 * its permanent shape, so marking it would put the bubble of every static item on a
 * five-minute cache, and each expiry re-presigns and re-downloads the bytes.
 */
export function toSlotAsset(
  { stillKey, animatedKey, audioKey }: EmoticonItemAssets,
  slot: EmoticonSlot,
): Nullable<ResolvedSlotAsset> {
  if (slot === "audio") {
    return audioKey ? { key: audioKey, isFallback: false } : null;
  }

  const wants = slot === "still-image" ? stillKey : animatedKey;
  const other = slot === "still-image" ? animatedKey : stillKey;
  const key = wants ?? other;

  return key ? { key, isFallback: wants === null && slot === "still-image" } : null;
}

export type ResolvedSlotAsset = {
  key: string;
  /** The finished restructure. The asset came from a slot other than the one asked for. */
  isFallback: boolean;
};

/**
 * Marks the `media` rows behind `keys` deleted, inside the caller's own write.
 *
 * WARN: § 13.4. The rows go with the bytes and in the same transaction. Left live, the
 * owner's `GET /api/media/{id}` keeps 302ing at an object the purge has already taken —
 * which is the state these paths were actually in, since they deleted the objects and
 * left the rows behind.
 */
export async function detachEmoticonMedia(tx: DbTransaction, keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await tx
    .update(media)
    .set({ deletedAt: new Date() })
    .where(and(inArray(media.r2Key, keys), isNull(media.deletedAt)));
}

/** INFO: Any of the three slots, which is what "this `media` row belongs to an emoticon" means. */
function isSlotOf(mediaId: PgColumn) {
  return or(
    eq(emoticonItems.stillImageId, mediaId),
    eq(emoticonItems.animatedImageId, mediaId),
    eq(emoticonItems.audioId, mediaId),
  );
}

/** INFO: § 9. Every object these items draw from, read off the `media` rows their slots name — a caller about to delete the rows needs all of them to clean the bucket. */
export async function findItemSlotKeys(
  itemIds: EmoticonItemId[],
  // INFO: Taken so a delete can read the keys inside its own transaction, against the very rows it has just stamped.
  db: DbTransaction | ReturnType<typeof getDb> = getDb(),
): Promise<string[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinct({ r2Key: media.r2Key })
    .from(media)
    .innerJoin(emoticonItems, isSlotOf(media.id))
    .where(inArray(emoticonItems.id, itemIds));

  return rows.map((row) => row.r2Key);
}

export type DeleteEmoticonResult =
  { status: "deleted"; orphanedKeys: string[] } | { status: "not_found" };

/**
 * Takes an item out of the picker, mini or not (REQUIREMENTS.md § 13.4.): stamps
 * `deleted_at`, soft-deletes its media and reports the R2 keys that leaves behind so
 * the caller can clean the bucket (§ 9.).
 *
 * WARN: The row survives. `messages.emoticon_item_id` carries no cascade and
 * `messages_type_payload_check` forbids the `set null` that would otherwise let it
 * go — a sent item's box and keyword are what the tombstone in every bubble carrying
 * it draws from, and neither participant is asked first, since that is a full scan
 * of `messages` for an answer that no longer changes the outcome.
 */
export async function deleteEmoticonItem(id: EmoticonItemId): Promise<DeleteEmoticonResult> {
  // WARN: Read before the write — the keys live on the `media` rows the slots name, and the join needs the item row to still be there.
  const slotKeys = await findItemSlotKeys([id]);

  const isDeleted = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .update(emoticonItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(emoticonItems.id, id), isNull(emoticonItems.deletedAt)))
      .returning({ id: emoticonItems.id });

    if (!row) {
      return false;
    }

    await clearPackThumbnail(tx, id);

    await detachEmoticonMedia(tx, slotKeys);

    return true;
  });

  return isDeleted ? { status: "deleted", orphanedKeys: slotKeys } : { status: "not_found" };
}

/**
 * Falls a pack back on its first item when the item it was drawn with goes (§ 13.2.).
 *
 * WARN: What `thumbnail_item_id`'s `ON DELETE SET NULL` did for free until the delete
 * became an `UPDATE`. Left set, the tab icon keeps requesting an object the purge has
 * taken and R2 answers 404 for the life of the pack.
 */
async function clearPackThumbnail(tx: DbTransaction, itemId: EmoticonItemId): Promise<void> {
  await tx
    .update(emoticonPacks)
    .set({ thumbnailItemId: null })
    .where(eq(emoticonPacks.thumbnailItemId, itemId));
}
