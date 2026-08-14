import type { MediaId, UserId } from "@/shared/lib";
import { index, integer, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 10. The single source for the library too — a chat image is never copied into a second table.
export const media = pgTable(
  "media",
  {
    id: snowflake<MediaId>("id").primaryKey(),
    ownerId: snowflake<UserId>("owner_id")
      .notNull()
      .references(() => users.id),
    // WARN: REQUIREMENTS.md § 9. The key, never a URL — presigned URLs expire in minutes and are minted per request.
    r2Key: text("r2_key").notNull().unique(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    // INFO: REQUIREMENTS.md § 8.3. Required, so the virtualized list can reserve the box before the asset loads.
    // WARN: REQUIREMENTS.md § 9.1. Zero on a file attachment, which has no drawn box to reserve — every reader of these must branch on `filename` before trusting them as a ratio.
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    // WARN: REQUIREMENTS.md § 9.1. The discriminator, not decoration: a row with a filename is a file attachment, and it has no `_thumb` sibling, never enters the library (§ 10.) and is never drawn by the viewer. Set by the server from the stored mime, never taken as the client says it.
    filename: text("filename"),
    // WARN: REQUIREMENTS.md § 9.3. The discriminator for a **voice message**, exactly as `filename` above is the one for a file attachment: a row with peaks is a recording, and a row without them is not. It is the payload and the flag at once, which is deliberate — the alternative was a `kind` enum requiring a backfill of every existing row, and § 9.1. already established the pattern.
    // WARN: Integers `0`–`VOICE_PEAK_SCALE`, not floats, and always `VOICE_WAVEFORM_PEAKS` of them. `registerMedia` refuses any other shape, and refuses peaks at all on a mime that is not one § 9.3. records into — otherwise a JPEG could be filed as a voice message and would vanish from the library.
    waveformPeaks: smallint("waveform_peaks").array(),
    // INFO: DESIGN.md § 6.5. Null for a still image; a video cell draws its running time from this, read off the element that produced the poster frame.
    // WARN: § 9.3. Required in practice for a voice message — the § 8.3. box is fixed, but the player's progress is drawn against this figure and a null reads as a waveform that never moves.
    durationMs: integer("duration_ms"),
    blurhash: text("blurhash"),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    // INFO: The two `gallery_*` columns are named for the tab as it was called before § 7. renamed it 보관함 and § 10. gave it three shelves; the code above them says `archive`. Renaming them buys a name and costs another migrate-first deploy (§ 6. rule 2), which is not a trade worth making.
    // INFO: REQUIREMENTS.md § 10. Set only for an object uploaded straight into the library. Everything else earns its place there by hanging off a live message, and an object that has neither is an abandoned upload rather than a photo.
    galleryAddedAt: timestamp("gallery_added_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 18. #1. The library's delete. It is scoped to the library alone — the chat bubble the object was sent in keeps rendering it.
    galleryHiddenAt: timestamp("gallery_hidden_at", { withTimezone: true }),
    // WARN: Millisecond precision, unlike every other timestamp here. It is half of the § 10. keyset cursor, and that cursor crosses the wire as an ISO string via a JS `Date` — which has no sub-millisecond digits. At the default microsecond precision the cursor is a truncated copy of the stored value, so the boundary row's siblings compare *greater* than it and are skipped forever.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  // WARN: `id` is the tiebreaker, not decoration — `created_at` defaults to the *transaction* timestamp, so a multi-image send writes rows that compare equal and a § 10. keyset page boundary inside that group would skip or repeat images.
  (table) => [index("media_created_at_id_idx").on(table.createdAt.desc(), table.id.desc())],
);

export type Media = typeof media.$inferSelect;
