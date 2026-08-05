import "server-only";

import { isAllowedEmoticonAsset, type EmoticonSlot } from "@/shared/config";
import { emoticonItems, getDb } from "@/shared/db";
import type { Maybe, Nullable } from "@/shared/lib";
import { headAcceptableObject } from "@/shared/storage";
import { eq, sql } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";

export type RegisterEmoticonParams = {
  packId: string;
  uploaderId: string;
  stillKey: string;
  // INFO: REQUIREMENTS.md § 13.2. Read off the decoded still in the browser, because the server never receives the bytes to measure.
  width: number;
  height: number;
  animatedKey?: Maybe<string>;
  audioKey?: Maybe<string>;
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
  stillKey,
  width,
  height,
  animatedKey,
  audioKey,
}: RegisterEmoticonParams): Promise<Nullable<Emoticon>> {
  const [still, animated, audio] = await Promise.all([
    verifyAsset("still", stillKey, uploaderId),
    verifyAsset("animated", animatedKey, uploaderId),
    verifyAsset("audio", audioKey, uploaderId),
  ]);

  // INFO: A requested companion that failed verification is a rejection, not a reason to write the item without it — the user asked for an animated emoticon and would get a silent still.
  if (!still || (animatedKey && !animated) || (audioKey && !audio)) {
    return null;
  }

  const [row] = await getDb()
    .insert(emoticonItems)
    .values({
      packId,
      r2Key: stillKey,
      mime: still.mime,
      animatedKey: animatedKey ?? null,
      animatedMime: animated?.mime ?? null,
      audioKey: audioKey ?? null,
      audioMime: audio?.mime ?? null,
      width,
      height,
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
    .where(eq(emoticonItems.r2Key, stillKey))
    .limit(1);

  return existing ? toEmoticon(existing) : null;
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
