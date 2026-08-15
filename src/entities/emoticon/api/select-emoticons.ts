import "server-only";

import { emoticonItems, getDb, media } from "@/shared/db";
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/**
 * The base every read that builds an `Emoticon` is written on — the item joined to
 * the `media` rows its image slots name, so the row carries the box § 8.3. reserves.
 *
 * WARN: Two `leftJoin`s and never an inner one. Either image slot may be empty, and an inner join drops the very item the caller is asking about.
 *
 * WARN: The `coalesce` is typed as non-null because two CHECKs make it so — `emoticon_items_has_image_check` leaves every item an image slot, and `media_box_is_visual_check` leaves every image row a box.
 */
export function selectEmoticons() {
  const still = alias(media, "still_box");
  const animated = alias(media, "animated_box");

  return getDb()
    .select({
      item: emoticonItems,
      // INFO: § 8.3. The animation's box wherever there is one, because that is the box the bubble reserves and the bubble plays the animation.
      width: sql<number>`coalesce(${animated.width}, ${still.width})`,
      height: sql<number>`coalesce(${animated.height}, ${still.height})`,
    })
    .from(emoticonItems)
    .leftJoin(still, eq(still.id, emoticonItems.stillImageId))
    .leftJoin(animated, eq(animated.id, emoticonItems.animatedImageId));
}
