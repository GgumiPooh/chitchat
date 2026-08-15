import "server-only";

import { registerMedia } from "@/entities/media/@x/emoticon";
import {
  MAX_EMOTICON_IMAGE_SIZE,
  isAllowedEmoticonAsset,
  isAnimatedImage,
  normalizeKeywords,
  type EmoticonImageSlot,
  type EmoticonSlot,
} from "@/shared/config";
import { emoticonItems, getDb, media, nextSnowflake, type EmoticonItem } from "@/shared/db";
import type {
  EmoticonItemId,
  EmoticonPackId,
  Maybe,
  MediaId,
  Nullable,
  Optional,
  UserId,
} from "@/shared/lib";
import { headAcceptableObject, readObject, type StoredObject } from "@/shared/storage";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";
import { selectEmoticons } from "./select-emoticons";

/** INFO: § 8.3. The box travels with the key — new bytes are a new box, so neither is nameable without the other. */
export type EmoticonImageUpload = {
  key: string;
  // INFO: REQUIREMENTS.md § 13.2. Read off the decoded image in the browser, because the server never receives the bytes to measure.
  width: number;
  height: number;
};

export type RegisterEmoticonParams = {
  packId: EmoticonPackId;
  uploaderId: UserId;
  // INFO: The finished restructure. Either one alone is a whole emoticon; both absent is refused.
  still?: Maybe<EmoticonImageUpload>;
  animated?: Maybe<EmoticonImageUpload>;
  audioKey?: Maybe<string>;
  // INFO: REQUIREMENTS.md § 13.8. Absent for an item nobody has described — the column defaults to an empty array rather than being nullable.
  keywords?: Maybe<readonly string[]>;
};

/**
 * Turns uploaded objects into the row the picker and the chat bubble point at.
 *
 * WARN: This is where REQUIREMENTS.md § 14.'s type and size limits hold for
 * emoticons. The upload went straight to R2 (§ 13.3.), so the server never saw the
 * bytes — every key is read back and checked against its slot's rule before a row
 * exists to reference it. Nothing without a row is reachable from the app.
 */
export async function registerEmoticon({
  packId,
  uploaderId,
  still,
  animated,
  audioKey,
  keywords,
}: RegisterEmoticonParams): Promise<Nullable<Emoticon>> {
  const [stillObject, animatedObject, audio] = await Promise.all([
    verifyImage("still-image", still, uploaderId),
    verifyImage("animated-image", animated, uploaderId),
    verifyAsset("audio", audioKey, uploaderId),
  ]);

  // INFO: A requested slot that failed verification is a rejection, not a reason to write the item without it — the user asked for that image or that sound and would get an item missing it.
  if ((still && !stillObject) || (animated && !animatedObject) || (audioKey && !audio)) {
    return null;
  }

  // INFO: `emoticon_items_has_image_check`. The route refuses this too, but the import path (§ 13.7.) writes through here with no request body to have refused.
  if (!stillObject && !animatedObject) {
    return null;
  }

  // INFO: The finished restructure. The `media` rows behind this item, minted here so the FKs below have something to name.
  // INFO: `registerMedia` is idempotent on `r2_key`, so the retry the `onConflictDoNothing` below answers for does not mint a second row for the same object.
  const [stillMedia, animatedMedia, audioMedia] = await Promise.all([
    registerImageMedia(uploaderId, still, stillObject),
    registerImageMedia(uploaderId, animated, animatedObject),
    registerAudioMedia(uploaderId, audioKey),
  ]);

  // WARN: § 14. `registerMedia` re-reads the object and applies § 13.2.'s own slot rules, so this refuses what the verification above would have refused — and refusing here rather than writing the item without its FK is what keeps the two representations from disagreeing. An object left unreferenced is what § 13.3.'s discard endpoint exists to sweep.
  if ((still && !stillMedia) || (animated && !animatedMedia) || (audioKey && !audioMedia)) {
    return null;
  }

  const filledSlots = [
    stillMedia ? eq(emoticonItems.stillImageId, stillMedia.id) : null,
    animatedMedia ? eq(emoticonItems.animatedImageId, animatedMedia.id) : null,
  ].filter((slot) => slot !== null);

  // WARN: `or()` over an empty list is an empty `WHERE`, which would answer the lookup below with an arbitrary item. The guards above already make this unreachable.
  if (filledSlots.length === 0) {
    return null;
  }

  const [row] = await getDb()
    .insert(emoticonItems)
    .values({
      id: nextSnowflake<EmoticonItemId>(),
      packId,
      stillImageId: stillMedia?.id ?? null,
      animatedImageId: animatedMedia?.id ?? null,
      audioId: audioMedia?.id ?? null,
      // WARN: Normalized here as well as at the route, because § 13.7.'s import writes through this function without passing a request body through that schema.
      keywords: normalizeKeywords(keywords ?? []),
      sortOrder: sql`(
        select coalesce(max(${emoticonItems.sortOrder}), -1) + 1
        from ${emoticonItems}
        where ${emoticonItems.packId} = ${packId}
      )`,
    })
    // WARN: Untargeted, because any of the three slot indexes may be the one a retry collides on — `registerMedia` is idempotent on `media.r2_key`, so re-uploading the same objects re-registers them to the same ids and the second insert names slots the first one took.
    .onConflictDoNothing()
    .returning({ id: emoticonItems.id });

  // INFO: The row this call is answering for, whether it wrote it or the retry it repeats did — the slot ids are unique, so they name the same item either way.
  // WARN: Scoped to the pack, because a conflict is not proof of a retry. The same uploader naming an object already slotted into an item of **another** pack collides identically, and an unscoped lookup would answer `201` with that pack's item — adding it to a grid it does not belong to.
  const [written] = await selectEmoticons()
    .where(
      row
        ? eq(emoticonItems.id, row.id)
        : and(eq(emoticonItems.packId, packId), or(...filledSlots)),
    )
    .limit(1);

  return written ? toEmoticon(written) : null;
}

function registerImageMedia(
  ownerId: UserId,
  image: Maybe<EmoticonImageUpload>,
  object: Optional<StoredObject>,
) {
  return image && object
    ? registerMedia({
        ownerId,
        r2Key: image.key,
        width: image.width,
        height: image.height,
        scope: "emoticon",
      })
    : Promise.resolve(null);
}

// INFO: § 13.2. No box, because a sound has none — `registerMedia` reads the mime back off the object and files it as `audio`.
function registerAudioMedia(ownerId: UserId, key: Maybe<string>) {
  return key
    ? registerMedia({ ownerId, r2Key: key, width: null, height: null, scope: "emoticon" })
    : Promise.resolve(null);
}

export type UpdateEmoticonParams = {
  itemId: EmoticonItemId;
  uploaderId: UserId;
  // WARN: `undefined` keeps the slot the item already has and `null` empties it. Collapsing the two would make every edit of one slot silently drop the others.
  still?: Nullable<EmoticonImageUpload>;
  animated?: Nullable<EmoticonImageUpload>;
  audioKey?: Nullable<string>;
  // WARN: § 13.8. Absent keeps the item's keywords, exactly as the slots do; an empty array is the explicit "take them all away". An edit that only replaces an image must not clear them.
  keywords?: Maybe<readonly string[]>;
};

export type UpdateEmoticonResult =
  | { status: "updated"; emoticon: Emoticon; orphanedKeys: string[] }
  | { status: "not_found" }
  | { status: "unprocessable" };

/**
 * Replaces the assets behind an existing item (REQUIREMENTS.md § 13.4.).
 *
 * INFO: An item already sent in chat is edited like any other, unlike deleting one:
 * the bubble references the *item*, so the FK that blocks a delete has nothing to
 * say here, and a fixed image showing up in the history is the point of editing it.
 *
 * WARN: `updated_at` is what `Emoticon.version` and therefore the asset URL are
 * built from (§ 13.4.). Without bumping it the browser keeps serving the cached
 * redirect and the edit looks like it did nothing.
 */
export async function updateEmoticonItem({
  itemId,
  uploaderId,
  still,
  animated,
  audioKey,
  keywords,
}: UpdateEmoticonParams): Promise<UpdateEmoticonResult> {
  const [current] = await getDb()
    .select()
    .from(emoticonItems)
    .where(eq(emoticonItems.id, itemId))
    .limit(1);

  if (!current) {
    return { status: "not_found" };
  }

  // INFO: `emoticon_items_has_image_check` against what the item actually holds — the route can only refuse a body emptying *both*, where emptying the only one it has reads as legal until the constraint says otherwise.
  if (!willHoldAnImage(current, still, animated)) {
    return { status: "unprocessable" };
  }

  const [stillObject, animatedObject, verifiedAudio] = await Promise.all([
    verifyImage("still-image", still, uploaderId),
    verifyImage("animated-image", animated, uploaderId),
    verifyAsset("audio", audioKey, uploaderId),
  ]);

  if ((still && !stillObject) || (animated && !animatedObject) || (audioKey && !verifiedAudio)) {
    return { status: "unprocessable" };
  }

  const [stillMedia, animatedMedia, audioMedia] = await Promise.all([
    registerImageMedia(uploaderId, still, stillObject),
    registerImageMedia(uploaderId, animated, animatedObject),
    registerAudioMedia(uploaderId, audioKey),
  ]);

  if ((still && !stillMedia) || (animated && !animatedMedia) || (audioKey && !audioMedia)) {
    return { status: "unprocessable" };
  }

  // WARN: The three slot indexes are unique, and this UPDATE has no `onConflictDoNothing` to fall back on — an edit naming an object another item already holds would raise a `23505` the route has no branch for, and answer 500 where every other refusal here answers `unprocessable`.
  if (await isSlotTakenElsewhere(itemId, [stillMedia?.id, animatedMedia?.id, audioMedia?.id])) {
    return { status: "unprocessable" };
  }

  const hasImageChange = still !== undefined || animated !== undefined;

  await getDb()
    .update(emoticonItems)
    .set({
      ...(still === undefined ? {} : { stillImageId: stillMedia?.id ?? null }),
      ...(animated === undefined ? {} : { animatedImageId: animatedMedia?.id ?? null }),
      ...(audioKey === undefined ? {} : { audioId: audioMedia?.id ?? null }),
      ...(keywords ? { keywords: normalizeKeywords(keywords) } : {}),
      // WARN: § 13.4. Only when an *asset* changed. `updated_at` is `Emoticon.version` and rides on every asset URL, so bumping it for a keywords-only write invalidates the cached 302 and its presigned GET for that item — and § 13.8.1. writes one per item, which would re-download a whole pack, chat history included, to record some text.
      ...(hasImageChange || audioKey !== undefined ? { updatedAt: new Date() } : {}),
    })
    .where(eq(emoticonItems.id, itemId));

  // INFO: Read back rather than returned, because the box lives on the `media` rows the slots name and an edit of one slot keeps the other's.
  const [row] = await selectEmoticons().where(eq(emoticonItems.id, itemId)).limit(1);

  if (!row) {
    return { status: "not_found" };
  }

  // INFO: § 9. The objects the edit just detached — nothing references them any more, and nothing in the app addresses R2 by key, so they are unreachable until they are deleted.
  // WARN: The detached `media` rows are left as they are. An orphan there costs a row and is what the sweep is for; deleting one an old page may still name would answer that page a 404 instead of the image it was already showing.
  const orphanedKeys = await findDetachedKeys(current, { still, animated, audioKey });

  return { status: "updated", emoticon: toEmoticon(row), orphanedKeys };
}

/** INFO: Whether any of these `media` rows is already slotted into a **different** item, which is the one thing the slot indexes refuse and this UPDATE has no conflict clause to absorb. */
async function isSlotTakenElsewhere(
  itemId: EmoticonItemId,
  mediaIds: Maybe<MediaId>[],
): Promise<boolean> {
  const named = mediaIds.filter((id): id is MediaId => id !== undefined && id !== null);

  if (named.length === 0) {
    return false;
  }

  const [taken] = await getDb()
    .select({ id: emoticonItems.id })
    .from(emoticonItems)
    .where(
      and(
        ne(emoticonItems.id, itemId),
        or(
          inArray(emoticonItems.stillImageId, named),
          inArray(emoticonItems.animatedImageId, named),
          inArray(emoticonItems.audioId, named),
        ),
      ),
    )
    .limit(1);

  return taken !== undefined;
}

/** INFO: What the row would hold after this edit — an absent slot keeps what it has, `null` empties it, a value fills it. */
function willHoldAnImage(
  current: EmoticonItem,
  still: Maybe<EmoticonImageUpload>,
  animated: Maybe<EmoticonImageUpload>,
): boolean {
  const keeps = (next: Maybe<EmoticonImageUpload>, held: Nullable<MediaId>) =>
    next === undefined ? held !== null : next !== null;

  return keeps(still, current.stillImageId) || keeps(animated, current.animatedImageId);
}

/**
 * The R2 keys this edit detached, read off the `media` rows the slots used to name.
 *
 * WARN: The keys the edit is *keeping* are subtracted rather than assumed absent. A
 * re-submitted key re-registers to the same `media` row (`registerMedia` is
 * idempotent on `r2_key`), so the slot it names is unchanged and reporting it here
 * would delete the object the item is still drawn from.
 */
async function findDetachedKeys(
  current: EmoticonItem,
  next: {
    still?: Nullable<EmoticonImageUpload>;
    animated?: Nullable<EmoticonImageUpload>;
    audioKey?: Nullable<string>;
  },
): Promise<string[]> {
  const detached = [
    next.still === undefined ? null : current.stillImageId,
    next.animated === undefined ? null : current.animatedImageId,
    next.audioKey === undefined ? null : current.audioId,
  ].filter((id): id is MediaId => id !== null);

  if (detached.length === 0) {
    return [];
  }

  const kept = new Set(
    [next.still?.key, next.animated?.key, next.audioKey].filter((key) => typeof key === "string"),
  );
  const rows = await getDb()
    .select({ r2Key: media.r2Key })
    .from(media)
    .where(inArray(media.id, detached));

  return rows.map((row) => row.r2Key).filter((key) => !kept.has(key));
}

/**
 * WARN: The key prefix is the ownership proof. `buildStorageKey` puts the
 * uploader's id in the key (§ 9.), so a caller naming a key it did not upload is
 * claiming someone else's object — the pack being shared does not make the
 * *object* claimable.
 */
async function verifyAsset(slot: EmoticonSlot, key: Maybe<string>, uploaderId: UserId) {
  if (!key || !key.startsWith(`emoticon/${uploaderId}/`)) {
    return undefined;
  }

  return headAcceptableObject(key, ({ mime, size }) => isAllowedEmoticonAsset(slot, mime, size));
}

/**
 * The same check, plus the one thing that decides which image slot the object
 * belongs in.
 *
 * WARN: The browser already refused a mismatch (`useEmoticonDraft`), and this is
 * not that check repeated for its own sake — the browser's answer never reached the
 * server. The upload goes straight to R2 (§ 13.3.), so a client that skipped the
 * form entirely is the only thing this sees, exactly as § 14. describes for type
 * and size.
 *
 * WARN: The stored bytes, never the stored mime. `image/webp` and `image/gif` are
 * both legal for one frame and an APNG is stored as `image/png`, so a mime test
 * would put a picture in the animated slot — where the bubble would play a still,
 * and the asset route's fallback would have nothing to fall back to.
 */
async function verifyImage(
  slot: EmoticonImageSlot,
  image: Maybe<EmoticonImageUpload>,
  uploaderId: UserId,
): Promise<Optional<StoredObject>> {
  if (!image) {
    return undefined;
  }

  // WARN: The key prefix is the ownership proof, and it is checked before anything is read — `buildStorageKey` puts the uploader's id in the key (§ 9.), so a caller naming a key it did not upload is claiming someone else's object.
  if (!image.key.startsWith(`emoticon/${uploaderId}/`)) {
    return undefined;
  }

  // INFO: One read, not a HEAD and then a GET of the same object. `readObject` answers the stored mime and refuses anything past the ceiling, which is the whole of what the HEAD was checking.
  const fetched = await readObject(image.key, MAX_EMOTICON_IMAGE_SIZE);

  if (!fetched || !isAllowedEmoticonAsset(slot, fetched.mime, fetched.bytes.byteLength)) {
    return undefined;
  }

  return isAnimatedImage(fetched.bytes) === (slot === "animated-image")
    ? { mime: fetched.mime, size: fetched.bytes.byteLength }
    : undefined;
}
