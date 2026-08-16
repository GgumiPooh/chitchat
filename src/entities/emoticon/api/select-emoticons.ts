import "server-only";

import { emoticonItems, getDb, media } from "@/shared/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";

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

/**
 * Whether an item is still one a user may choose — every list the picker, search,
 * 최근 사용 and the settings grids are drawn from (REQUIREMENTS.md § 13.).
 *
 * WARN: § 13. Two columns and they mean different things. `retired_at` leaves the item
 * drawing in every bubble that already carries it; `deleted_at` has had its objects
 * purged and draws a replacement instead. Both are gone from here, and neither may be
 * read as the other.
 *
 * INFO: Takes the two columns rather than the table, so the aliased subqueries in
 * `get-emoticon-packs` — the tab icon and the item count — apply the same predicate the
 * list they belong to is built on. An `alias()` is a different table type.
 */
export function isChoosable(items: { retiredAt: PgColumn; deletedAt: PgColumn }) {
  return and(isNull(items.retiredAt), isNull(items.deletedAt));
}
