import { EMOTICON_PACK_TYPES } from "@/shared/config";
import type {
  EmoticonFavoriteId,
  EmoticonItemId,
  EmoticonPackId,
  MediaId,
  UserId,
} from "@/shared/lib";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { media } from "./media";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 13. The only place the two kinds are distinguished — an item's kind is derived from its pack, so `emoticon_items` carries no column of its own.
// INFO: Declared from the config list for the reason `media.kind` is, so a kind cannot be added to one and forgotten in the other.
export const emoticonPackTypeEnum = pgEnum("emoticon_pack_type", EMOTICON_PACK_TYPES);

// INFO: REQUIREMENTS.md § 13. Packs are authored in the app, never seeded — there is no `scripts/seed-emoticons.ts`.
export const emoticonPacks = pgTable("emoticon_packs", {
  id: snowflake<EmoticonPackId>("id").primaryKey(),
  name: text("name").notNull(),
  // WARN: Read it as a required argument rather than an optional filter (§ 13.). A caller that may omit it is a mini leaking into the picker, and that is the only real failure mode this column has.
  type: emoticonPackTypeEnum("type").notNull().default("emoticon"),
  // WARN: REQUIREMENTS.md § 13.2. A cycle with `emoticon_items`, so the constraint is added by a separate ALTER TABLE. `set null`, because removing the item a pack uses as its tab icon must not remove the pack.
  thumbnailItemId: snowflake<EmoticonItemId>("thumbnail_item_id").references(
    (): AnyPgColumn => emoticonItems.id,
    {
      onDelete: "set null",
    },
  ),
  // INFO: REQUIREMENTS.md § 13.5. Soft, for the reason `emoticon_items.deleted_at` is — a hard `DELETE` cascades into items, and `messages.emoticon_item_id` has no cascade to survive it.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const emoticonItems = pgTable(
  "emoticon_items",
  {
    id: snowflake<EmoticonItemId>("id").primaryKey(),
    packId: snowflake<EmoticonPackId>("pack_id")
      .notNull()
      .references(() => emoticonPacks.id, { onDelete: "cascade" }),
    // INFO: The finished restructure. The three slots an emoticon's assets become.
    // WARN: No `onDelete`, so NO ACTION blocks removing a `media` row an item still draws from. `set null` is the tempting alternative and is wrong: it would resolve the constraint by silently emptying a slot every bubble in the history renders from.
    stillImageId: snowflake<MediaId>("still_image_id").references(() => media.id),
    animatedImageId: snowflake<MediaId>("animated_image_id").references(() => media.id),
    audioId: snowflake<MediaId>("audio_id").references(() => media.id),
    // INFO: REQUIREMENTS.md § 13.8. What the composer matches a typed word against. Shared like `sort_order`, and empty for an item nobody has described yet.
    keywords: text("keywords").array().notNull().default([]),
    // INFO: REQUIREMENTS.md § 13.1. Authoring order, shared by both users — item order is deliberately not per-user.
    sortOrder: smallint("sort_order").notNull(),
    // WARN: REQUIREMENTS.md § 13.4. What the asset URL is versioned by. Editing an item swaps its R2 keys under an unchanged item id, and the asset redirect is cached (§ 9.), so without this the old image survives the edit.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // INFO: REQUIREMENTS.md § 13.4. 삭제, which either participant may do. Soft for the reason `media.deleted_at` is: the box a bubble reserves is on the row, so the tombstone drawn in its place needs the row to survive the asset.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("emoticon_items_pack_id_sort_order_idx").on(table.packId, table.sortOrder),
    // INFO: What makes a retried registration idempotent — `registerMedia` returns the same `media` row for a re-uploaded key, so the second insert conflicts on the slot it names.
    uniqueIndex("emoticon_items_still_image_id_idx").on(table.stillImageId),
    uniqueIndex("emoticon_items_animated_image_id_idx").on(table.animatedImageId),
    uniqueIndex("emoticon_items_audio_id_idx").on(table.audioId),
    // WARN: The finished restructure. The floor under both nullable image slots. An author may register either one, and `toSlotAsset` falls back both ways — but an item with neither draws nothing anywhere, which no screen has a state for.
    check(
      "emoticon_items_has_image_check",
      sql`"still_image_id" IS NOT NULL OR "animated_image_id" IS NOT NULL`,
    ),
  ],
);

/**
 * REQUIREMENTS.md § 13.9.1. The search index behind `emoticon_items.keywords`, one
 * row per lowercased keyword.
 *
 * WARN: A projection, never a source. The array on the item stays the authored,
 * case-preserving list every screen renders (§ 13.8.), and a trigger is what keeps
 * these rows level with it — `write-emoticon-item.ts` exists in both repositories,
 * so app-side maintenance would be two copies of the same write and an index that
 * silently drifts the moment one of them is fixed alone.
 *
 * WARN: Nothing here is a `Nullable` column and nothing is renumbered — this table
 * may be dropped and rebuilt from `emoticon_items` at any time.
 */
export const emoticonKeywords = pgTable(
  "emoticon_keywords",
  {
    itemId: snowflake<EmoticonItemId>("item_id")
      .notNull()
      .references(() => emoticonItems.id, { onDelete: "cascade" }),
    // INFO: § 13.9.1. Stored folded, because both directions of the match are case-insensitive and a folded column lets the btree below answer the reverse one with an equality probe.
    keyword: text("keyword").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.keyword] }),
    // WARN: § 13.9.1. The **reverse** direction's index — `term LIKE '%keyword%'` inverted into `keyword = ANY(substrings of term)`. The trigram GIN beside it (hand-written in the migration, as `messages_text_trgm_idx` is) answers the forward direction and cannot answer this one.
    index("emoticon_keywords_keyword_idx").on(table.keyword),
  ],
);

// INFO: REQUIREMENTS.md § 13.1. Per-user and pack-level. An absent row means **hidden**, so a pack is in a user's picker only once they have written one — which is why creating a pack fans out no rows.
export const userEmoticonPrefs = pgTable(
  "user_emoticon_prefs",
  {
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packId: snowflake<EmoticonPackId>("pack_id")
      .notNull()
      .references(() => emoticonPacks.id, { onDelete: "cascade" }),
    // WARN: § 13.1. The column default is not the feature's default — a missing row is hidden, and every writer states `enabled` rather than letting this decide.
    enabled: boolean("enabled").notNull().default(true),
    // WARN: REQUIREMENTS.md § 13.5. A sparse key, not an index — nullable on purpose, because `effectivePackPosition` falls a pack that has never been moved back onto its creation time in this same numeric space. A NOT NULL default would put every untouched pack on one value and reinstate the reshuffle the sparse key exists to remove.
    position: numeric("position"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.packId] })],
);

export const userEmoticonUsage = pgTable(
  "user_emoticon_usage",
  {
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: snowflake<EmoticonItemId>("item_id")
      .notNull()
      .references(() => emoticonItems.id, { onDelete: "cascade" }),
    useCount: integer("use_count").notNull().default(1),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.itemId] }),
    index("user_emoticon_usage_user_id_use_count_idx").on(
      table.userId,
      table.useCount.desc(),
      table.lastUsedAt.desc(),
    ),
  ],
);

export const userEmoticonFavorites = pgTable(
  "user_emoticon_favorites",
  {
    id: snowflake<EmoticonFavoriteId>("id").primaryKey(),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: snowflake<EmoticonItemId>("item_id")
      .notNull()
      .references(() => emoticonItems.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("user_emoticon_favorites_user_id_item_id_idx").on(table.userId, table.itemId),
    index("user_emoticon_favorites_user_id_id_idx").on(table.userId, table.id.desc()),
  ],
);

export type EmoticonKeyword = typeof emoticonKeywords.$inferSelect;

export type EmoticonItem = typeof emoticonItems.$inferSelect;

export type EmoticonPack = typeof emoticonPacks.$inferSelect;

export type EmoticonPackType = (typeof emoticonPackTypeEnum.enumValues)[number];

export type UserEmoticonPref = typeof userEmoticonPrefs.$inferSelect;

export type UserEmoticonUsage = typeof userEmoticonUsage.$inferSelect;

export type UserEmoticonFavorite = typeof userEmoticonFavorites.$inferSelect;
