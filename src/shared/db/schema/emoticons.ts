import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 13. Packs are registered by `scripts/seed-emoticons.ts`, never through the UI.
export const emoticonPacks = pgTable("emoticon_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  thumbnailKey: text("thumbnail_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emoticonItems = pgTable("emoticon_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  packId: uuid("pack_id")
    .notNull()
    .references(() => emoticonPacks.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull().unique(),
  // INFO: REQUIREMENTS.md § 8.3. Required, so the virtualized list can reserve the box before the asset loads.
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  sortOrder: smallint("sort_order").notNull(),
});

// INFO: REQUIREMENTS.md § 13. Per-user enable/disable and pack order; the picker reads only the enabled ones.
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
