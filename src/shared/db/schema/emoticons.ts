import {
  boolean,
  index,
  integer,
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
    // INFO: REQUIREMENTS.md § 13.3. The R2 key itself, not a `media` row — an emoticon is neither gallery content nor a thumbnailed pair.
    r2Key: text("r2_key").notNull().unique(),
    mime: text("mime").notNull(),
    // INFO: REQUIREMENTS.md § 13.2. Optional companions. Either may be absent, and audio does not imply animation.
    animatedKey: text("animated_key").unique(),
    animatedMime: text("animated_mime"),
    audioKey: text("audio_key").unique(),
    audioMime: text("audio_mime"),
    // WARN: REQUIREMENTS.md § 13.2. The *still* image's size. The animation shares this box rather than measuring its own, so a mismatched animation is letterboxed instead of re-measuring the row (§ 8.3.).
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // INFO: REQUIREMENTS.md § 13.1. Authoring order, shared by both users — item order is deliberately not per-user.
    sortOrder: smallint("sort_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("emoticon_items_pack_id_sort_order_idx").on(table.packId, table.sortOrder)],
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
    sortOrder: smallint("sort_order").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.packId] })],
);

export type EmoticonItem = typeof emoticonItems.$inferSelect;

export type EmoticonPack = typeof emoticonPacks.$inferSelect;

export type UserEmoticonPref = typeof userEmoticonPrefs.$inferSelect;
