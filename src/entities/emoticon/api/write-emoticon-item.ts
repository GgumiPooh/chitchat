import "server-only";

import { isAllowedEmoticonAsset, normalizeKeywords, type EmoticonSlot } from "@/shared/config";
import { emoticonItems, getDb } from "@/shared/db";
import type { Maybe, Nullable } from "@/shared/lib";
import { headAcceptableObject } from "@/shared/storage";
import { eq, sql } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";

export type RegisterEmoticonParams = {
  packId: string;
  uploaderId: string;
  imageKey: string;
  // INFO: REQUIREMENTS.md § 13.2. Read off the decoded image in the browser, because the server never receives the bytes to measure.
  width: number;
  height: number;
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
  imageKey,
  width,
  height,
  audioKey,
  keywords,
}: RegisterEmoticonParams): Promise<Nullable<Emoticon>> {
  const [image, audio] = await Promise.all([
    verifyAsset("image", imageKey, uploaderId),
    verifyAsset("audio", audioKey, uploaderId),
  ]);

  // INFO: A requested companion that failed verification is a rejection, not a reason to write the item without it — the user asked for a sound and would get a silent emoticon.
  if (!image || (audioKey && !audio)) {
    return null;
  }

  const [row] = await getDb()
    .insert(emoticonItems)
    .values({
      packId,
      r2Key: imageKey,
      mime: image.mime,
      audioKey: audioKey ?? null,
      audioMime: audio?.mime ?? null,
      width,
      height,
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
    .where(eq(emoticonItems.r2Key, imageKey))
    .limit(1);

  return existing ? toEmoticon(existing) : null;
}

export type UpdateEmoticonParams = {
  itemId: string;
  uploaderId: string;
  // INFO: The image is replaced as a unit — new bytes are a new box (§ 8.3.), so the dimensions travel with the key rather than being editable on their own.
  image?: { key: string; width: number; height: number };
  // WARN: `undefined` keeps the audio the item already has and `null` removes it. Collapsing the two would make every image-only edit silently drop the sound.
  audioKey?: Nullable<string>;
  // WARN: § 13.8. Absent keeps the item's keywords, exactly as `audioKey` does; an empty array is the explicit "take them all away". An edit that only replaces the image must not clear them.
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
  image,
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

  const [verifiedImage, verifiedAudio] = await Promise.all([
    verifyAsset("image", image?.key, uploaderId),
    verifyAsset("audio", audioKey, uploaderId),
  ]);

  if ((image && !verifiedImage) || (audioKey && !verifiedAudio)) {
    return { status: "unprocessable" };
  }

  const [row] = await getDb()
    .update(emoticonItems)
    .set({
      ...(image && verifiedImage
        ? { r2Key: image.key, mime: verifiedImage.mime, width: image.width, height: image.height }
        : {}),
      ...(audioKey === undefined
        ? {}
        : { audioKey, audioMime: audioKey === null ? null : (verifiedAudio?.mime ?? null) }),
      ...(keywords ? { keywords: normalizeKeywords(keywords) } : {}),
      // WARN: § 13.4. Only when an *asset* changed. `updated_at` is `Emoticon.version` and rides on every asset URL, so bumping it for a keywords-only write invalidates the cached 302 and its presigned GET for that item — and § 13.8.1. writes one per item, which would re-download a whole pack, chat history included, to record some text.
      ...(image || audioKey !== undefined ? { updatedAt: new Date() } : {}),
    })
    .where(eq(emoticonItems.id, itemId))
    .returning();

  if (!row) {
    return { status: "not_found" };
  }

  // INFO: § 9. The objects the edit just detached — nothing references them any more, and nothing in the app addresses R2 by key, so they are unreachable until they are deleted.
  const orphanedKeys = [
    image ? current.r2Key : null,
    audioKey === undefined || current.audioKey === audioKey ? null : current.audioKey,
  ].filter((key): key is string => key !== null);

  return { status: "updated", emoticon: toEmoticon(row), orphanedKeys };
}

/**
 * WARN: The key prefix is the ownership proof. `buildStorageKey` puts the
 * uploader's id in the key (§ 9.), so a caller naming a key it did not upload is
 * claiming someone else's object — the pack being shared does not make the
 * *object* claimable.
 */
async function verifyAsset(slot: EmoticonSlot, key: Maybe<string>, uploaderId: string) {
  if (!key || !key.startsWith(`emoticon/${uploaderId}/`)) {
    return undefined;
  }

  return headAcceptableObject(key, ({ mime, size }) => isAllowedEmoticonAsset(slot, mime, size));
}
