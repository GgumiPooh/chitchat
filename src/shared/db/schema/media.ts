import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 10. The single source for the gallery too — a chat image is never copied into a second table.
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    // WARN: REQUIREMENTS.md § 9. The key, never a URL — presigned URLs expire in minutes and are minted per request.
    r2Key: text("r2_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    // INFO: REQUIREMENTS.md § 8.3. Required, so the virtualized list can reserve the box before the asset loads.
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    blurhash: text("blurhash"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // WARN: `id` is the tiebreaker, not decoration — `created_at` defaults to the *transaction* timestamp, so a multi-image send writes rows that compare equal and a § 10. keyset page boundary inside that group would skip or repeat images.
  (table) => [index("media_created_at_id_idx").on(table.createdAt.desc(), table.id.desc())],
);

export type Media = typeof media.$inferSelect;
