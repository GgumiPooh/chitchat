import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// INFO: REQUIREMENTS.md § 8.9. `video` is the one kind that gets a play affordance; everything else is a plain card.
export const linkPreviewKindEnum = pgEnum("link_preview_kind", ["link", "video"]);

// INFO: REQUIREMENTS.md § 8.9. A row is written for a page with no metadata too — that is a cached "no card", not a miss to retry on every scroll past the bubble.
export const linkPreviewStatusEnum = pgEnum("link_preview_status", ["ok", "empty", "failed"]);

/**
 * REQUIREMENTS.md § 8.9. The scrape cache, keyed by the URL as it appears in the
 * message. It hangs off no message: two bubbles carrying the same link share one
 * row, and a deleted message leaves the entry to expire on its own.
 */
export const linkPreviews = pgTable("link_previews", {
  url: text("url").primaryKey(),
  status: linkPreviewStatusEnum("status").notNull(),
  kind: linkPreviewKindEnum("kind").notNull().default("link"),
  title: text("title"),
  description: text("description"),
  // WARN: A third-party URL, unlike every other image in the app (§ 9.) — it is rendered straight from the origin that published it and is never fetched or stored by us.
  imageUrl: text("image_url"),
  // INFO: REQUIREMENTS.md § 8.9. A signed thumbnail dies long before the row does, so the signature's own deadline is read off the URL at scrape time and the tile is withheld past it.
  imageExpiresAt: timestamp("image_expires_at", { withTimezone: true }),
  // INFO: REQUIREMENTS.md § 8.9. Read off the image's own header at scrape time, for the same reason `media` stores a box (§ 8.3.) — the card reserves its ratio before a byte of the thumbnail arrives. Null for every row scraped before the columns, and for an image the probe could not read.
  imageWidth: integer("image_width"),
  imageHeight: integer("image_height"),
  siteName: text("site_name"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LinkPreviewRow = typeof linkPreviews.$inferSelect;

export type LinkPreviewKind = (typeof linkPreviewKindEnum.enumValues)[number];

export type LinkPreviewStatus = (typeof linkPreviewStatusEnum.enumValues)[number];
