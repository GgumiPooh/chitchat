import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 13. Packs are authored in the app, never seeded — there is no `scripts/seed-emoticons.ts`.
export const emoticonPacks = pgTable("emoticon_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // INFO: REQUIREMENTS.md § 13.1. A record of who created it, never a permission check — a pack belongs to the conversation.
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  // WARN: REQUIREMENTS.md § 13.2. A cycle with `emoticon_items`, so the constraint is added by a separate ALTER TABLE. `set null`, because removing the item a pack uses as its tab icon must not remove the pack.
  thumbnailItemId: uuid("thumbnail_item_id").references((): AnyPgColumn => emoticonItems.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emoticonItems = pgTable(
  "emoticon_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packId: uuid("pack_id")
      .notNull()
      .references(() => emoticonPacks.id, { onDelete: "cascade" }),
    // INFO: REQUIREMENTS.md § 13.3. The R2 key itself, not a `media` row — an emoticon is neither library content nor a thumbnailed pair.
    r2Key: text("r2_key").notNull().unique(),
    // INFO: REQUIREMENTS.md § 13.2. One image slot for both kinds — an animated GIF or WebP is stored here exactly as a PNG is, and the renderer never branches on which it got.
    mime: text("mime").notNull(),
    // INFO: REQUIREMENTS.md § 13.2. The one optional companion. Audio does not imply animation and is played on tap only.
    audioKey: text("audio_key").unique(),
    audioMime: text("audio_mime"),
    // WARN: REQUIREMENTS.md § 13.2. The image's own size, read in the browser — an animated file is measured from its first frame, which is the box every frame shares (§ 8.3.).
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // INFO: REQUIREMENTS.md § 13.8. What the composer matches a typed word against. Shared like `sort_order`, and empty for an item nobody has described yet.
    keywords: text("keywords").array().notNull().default([]),
    // INFO: REQUIREMENTS.md § 13.1. Authoring order, shared by both users — item order is deliberately not per-user.
    sortOrder: smallint("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // WARN: REQUIREMENTS.md § 13.4. What the asset URL is versioned by. Editing an item swaps its R2 keys under an unchanged item id, and the asset redirect is cached (§ 9.), so without this the old image survives the edit.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("emoticon_items_pack_id_sort_order_idx").on(table.packId, table.sortOrder)],
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
    itemId: uuid("item_id")
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

// INFO: REQUIREMENTS.md § 13.1. Per-user and pack-level. An absent row means enabled, so creating a pack fans out no rows.
export const userEmoticonPrefs = pgTable(
  "user_emoticon_prefs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packId: uuid("pack_id")
      .notNull()
      .references(() => emoticonPacks.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    // WARN: REQUIREMENTS.md § 13.5. A sparse key, not an index — nullable on purpose, because `effectivePackPosition` falls a pack that has never been moved back onto its creation time in this same numeric space. A NOT NULL default would put every untouched pack on one value and reinstate the reshuffle the sparse key exists to remove.
    position: numeric("position"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.packId] })],
);

export type EmoticonKeyword = typeof emoticonKeywords.$inferSelect;

export type EmoticonItem = typeof emoticonItems.$inferSelect;

export type EmoticonPack = typeof emoticonPacks.$inferSelect;

export type UserEmoticonPref = typeof userEmoticonPrefs.$inferSelect;
