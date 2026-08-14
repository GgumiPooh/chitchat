import "server-only";

import { registerMedia } from "@/entities/media/@x/emoticon";
import {
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
import { eq, inArray, sql } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";

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

  // INFO: § 5.2.'s CHECK. The route refuses this too, but the import path (§ 13.7.) writes through here with no request body to have refused.
  if (!stillObject && !animatedObject) {
    return null;
  }

  // INFO: The finished restructure. The `media` rows behind this item, minted here so the FKs below have something to name.
  // INFO: `registerMedia` is idempotent on `r2_key`, so the retry the `onConflictDoNothing` below answers for does not mint a second row for the same object.
  const [stillMedia, animatedMedia, audioMedia] = await Promise.all([
    registerImageMedia(uploaderId, still, stillObject),
    registerImageMedia(uploaderId, animated, animatedObject),
    audioKey
      ? registerMedia({
          ownerId: uploaderId,
          r2Key: audioKey,
          width: null,
          height: null,
          scope: "emoticon",
        })
      : Promise.resolve(null),
  ]);

  // WARN: § 14. `registerMedia` re-reads the object and applies § 13.2.'s own slot rules, so this refuses what the verification above would have refused — and refusing here rather than writing the item without its FK is what keeps the two representations from disagreeing. An object left unreferenced is what § 13.3.'s discard endpoint exists to sweep.
  if ((still && !stillMedia) || (animated && !animatedMedia) || (audioKey && !audioMedia)) {
    return null;
  }

  // WARN: The animation where there is one, because § 8.3. reserves the **bubble's** box and the bubble plays the animation. The legacy columns are one image's worth and the item may now hold two; they are dropped in migration D.
  const primary = animated ?? still;
  const primaryObject = animatedObject ?? stillObject;

  if (!primary || !primaryObject) {
    return null;
  }

  const [row] = await getDb()
    .insert(emoticonItems)
    .values({
      id: nextSnowflake<EmoticonItemId>(),
      packId,
      r2Key: primary.key,
      mime: primaryObject.mime,
      audioKey: audioKey ?? null,
      audioMime: audio?.mime ?? null,
      stillImageId: stillMedia?.id ?? null,
      animatedImageId: animatedMedia?.id ?? null,
      audioId: audioMedia?.id ?? null,
      width: primary.width,
      height: primary.height,
      // WARN: Normalized here as well as at the route, because § 13.7.'s import writes through this function without passing a request body through that schema.
      keywords: normalizeKeywords(keywords ?? []),
      sortOrder: sql`(
        select coalesce(max(${emoticonItems.sortOrder}), -1) + 1
        from ${emoticonItems}
        where ${emoticonItems.packId} = ${packId}
      )`,
    })
    // INFO: `r2_key` is unique, so a retried submit returns nothing here rather than writing the item twice.
    .onConflictDoNothing({ target: emoticonItems.r2Key })
    .returning();

  if (row) {
    return toEmoticon(row);
  }

  const [existing] = await getDb()
    .select()
    .from(emoticonItems)
    .where(eq(emoticonItems.r2Key, primary.key))
    .limit(1);

  return existing ? toEmoticon(existing) : null;
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

  // INFO: § 5.2.'s CHECK against what the item actually holds — the route can only refuse a body emptying *both*, where emptying the only one it has reads as legal until the constraint says otherwise.
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

  const [stillMedia, animatedMedia] = await Promise.all([
    registerImageMedia(uploaderId, still, stillObject),
    registerImageMedia(uploaderId, animated, animatedObject),
  ]);

  if ((still && !stillMedia) || (animated && !animatedMedia)) {
    return { status: "unprocessable" };
  }

  const hasImageChange = still !== undefined || animated !== undefined;
  const primary = animated ?? still;
  const primaryObject = animatedObject ?? stillObject;

  const [row] = await getDb()
    .update(emoticonItems)
    .set({
      ...(still === undefined ? {} : { stillImageId: stillMedia?.id ?? null }),
      ...(animated === undefined ? {} : { animatedImageId: animatedMedia?.id ?? null }),
      // WARN: The legacy columns hold one image's worth of a row that may now carry two, so they follow whichever slot this edit wrote — § 8.3.'s box preferring the animation, as the bubble does. Dropped in migration D.
      ...(primary && primaryObject
        ? {
            r2Key: primary.key,
            mime: primaryObject.mime,
            width: primary.width,
            height: primary.height,
          }
        : {}),
      ...(audioKey === undefined
        ? {}
        : { audioKey, audioMime: audioKey === null ? null : (verifiedAudio?.mime ?? null) }),
      ...(keywords ? { keywords: normalizeKeywords(keywords) } : {}),
      // WARN: § 13.4. Only when an *asset* changed. `updated_at` is `Emoticon.version` and rides on every asset URL, so bumping it for a keywords-only write invalidates the cached 302 and its presigned GET for that item — and § 13.8.1. writes one per item, which would re-download a whole pack, chat history included, to record some text.
      ...(hasImageChange || audioKey !== undefined ? { updatedAt: new Date() } : {}),
    })
    .where(eq(emoticonItems.id, itemId))
    .returning();

  if (!row) {
    return { status: "not_found" };
  }

  // INFO: § 9. The objects the edit just detached — nothing references them any more, and nothing in the app addresses R2 by key, so they are unreachable until they are deleted.
  // WARN: The detached `media` rows are left as they are. An orphan there costs a row and is what § 12.2.'s sweep is for; deleting one an old page may still name would answer that page a 404 instead of the image it was already showing.
  const orphanedKeys = await findDetachedKeys(current, { still, animated, audioKey });

  return { status: "updated", emoticon: toEmoticon(row), orphanedKeys };
}

/** INFO: § 5.2. What the row would hold after this edit — an absent slot keeps what it has, `null` empties it, a value fills it. */
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
 * WARN: `current.r2Key` is not the answer any more. It holds one image's worth of a
 * row that may carry two, so a still-only edit would report the animation's key and
 * delete the object the bubble is still playing.
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
  ].filter((id): id is MediaId => id !== null);

  const rows = detached.length
    ? await getDb().select({ r2Key: media.r2Key }).from(media).where(inArray(media.id, detached))
    : [];

  return [
    ...rows.map((row) => row.r2Key),
    next.audioKey === undefined || current.audioKey === next.audioKey ? null : current.audioKey,
  ].filter((key): key is string => key !== null);
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
 * and § 5.4.'s fallback would have nothing to fall back to.
 */
async function verifyImage(
  slot: EmoticonImageSlot,
  image: Maybe<EmoticonImageUpload>,
  uploaderId: UserId,
): Promise<Optional<StoredObject>> {
  if (!image) {
    return undefined;
  }

  const object = await verifyAsset(slot, image.key, uploaderId);

  if (!object) {
    return undefined;
  }

  const bytes = await readObject(image.key);

  if (!bytes) {
    return undefined;
  }

  return isAnimatedImage(bytes) === (slot === "animated-image") ? object : undefined;
}
