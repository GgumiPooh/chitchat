import "server-only";

import { emoticonItems, getDb, nextSnowflake, userEmoticonFavorites } from "@/shared/db";
import type { EmoticonFavoriteId, EmoticonItemId, UserId } from "@/shared/lib";
import { and, desc, eq } from "drizzle-orm";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon } from "../model/types";
import { isChoosable, selectEmoticons } from "./select-emoticons";

/**
 * Lists all favorited emoticons for a user, most recently favorited first.
 * Deleted emoticons are filtered out via `isChoosable`.
 */
export async function listUserEmoticonFavorites(userId: UserId): Promise<Emoticon[]> {
  const rows = await selectEmoticons()
    .innerJoin(
      userEmoticonFavorites,
      and(
        eq(userEmoticonFavorites.itemId, emoticonItems.id),
        eq(userEmoticonFavorites.userId, userId),
      ),
    )
    .where(isChoosable(emoticonItems))
    .orderBy(desc(userEmoticonFavorites.id));

  return rows.map(toEmoticon);
}

/**
 * Lists the IDs of favorited emoticons for a user.
 */
export async function listUserEmoticonFavoriteIds(userId: UserId): Promise<EmoticonItemId[]> {
  const rows = await getDb()
    .select({ itemId: userEmoticonFavorites.itemId })
    .from(userEmoticonFavorites)
    .innerJoin(emoticonItems, eq(emoticonItems.id, userEmoticonFavorites.itemId))
    .where(and(eq(userEmoticonFavorites.userId, userId), isChoosable(emoticonItems)))
    .orderBy(desc(userEmoticonFavorites.id));

  return rows.map((row) => row.itemId);
}

/**
 * Adds an emoticon to the user's favorites. Idempotent on conflict.
 */
export async function addEmoticonFavorite(userId: UserId, itemId: EmoticonItemId): Promise<void> {
  const id = nextSnowflake<EmoticonFavoriteId>();

  await getDb()
    .insert(userEmoticonFavorites)
    .values({ id, userId, itemId })
    .onConflictDoNothing({
      target: [userEmoticonFavorites.userId, userEmoticonFavorites.itemId],
    });
}

/**
 * Removes an emoticon from the user's favorites.
 */
export async function removeEmoticonFavorite(
  userId: UserId,
  itemId: EmoticonItemId,
): Promise<void> {
  await getDb()
    .delete(userEmoticonFavorites)
    .where(and(eq(userEmoticonFavorites.userId, userId), eq(userEmoticonFavorites.itemId, itemId)));
}
