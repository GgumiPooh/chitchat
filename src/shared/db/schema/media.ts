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
    // INFO: DESIGN.md § 6.5. Null for a still image; a video cell draws its running time from this, read off the element that produced the poster frame.
    durationMs: integer("duration_ms"),
    blurhash: text("blurhash"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 10. Set only for an object uploaded straight into the gallery. Everything else earns its place there by hanging off a live message, and an object that has neither is an abandoned upload rather than a photo.
    galleryAddedAt: timestamp("gallery_added_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 18. #1. The gallery's delete. It is scoped to the gallery alone — the chat bubble the object was sent in keeps rendering it.
    galleryHiddenAt: timestamp("gallery_hidden_at", { withTimezone: true }),
    // WARN: Millisecond precision, unlike every other timestamp here. It is half of the § 10. keyset cursor, and that cursor crosses the wire as an ISO string via a JS `Date` — which has no sub-millisecond digits. At the default microsecond precision the cursor is a truncated copy of the stored value, so the boundary row's siblings compare *greater* than it and are skipped forever.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  // WARN: `id` is the tiebreaker, not decoration — `created_at` defaults to the *transaction* timestamp, so a multi-image send writes rows that compare equal and a § 10. keyset page boundary inside that group would skip or repeat images.
  (table) => [index("media_created_at_id_idx").on(table.createdAt.desc(), table.id.desc())],
);

export type Media = typeof media.$inferSelect;
