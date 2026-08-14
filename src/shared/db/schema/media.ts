import { MEDIA_KINDS, MEDIA_SCOPES, type MediaKind, type MediaScope } from "@/shared/config";
import type { MediaId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 10. The single source for the library too — a chat image is never copied into a second table.
// INFO: RESTRUCTURE.md § 1.2. Every uploaded object lives here, emoticon assets included (§ 5.) — "media" in the IANA sense, which is what `mime` already names.
export const media = pgTable(
  "media",
  {
    id: snowflake<MediaId>("id").primaryKey(),
    ownerId: snowflake<UserId>("owner_id")
      .notNull()
      .references(() => users.id),
    // WARN: REQUIREMENTS.md § 9. The key, never a URL — presigned URLs expire in minutes and are minted per request.
    r2Key: text("r2_key").notNull().unique(),
    // INFO: RESTRUCTURE.md § 2.2. What this row is, decided at registration rather than probed back out of the nullable columns below.
    kind: text("kind").$type<MediaKind>().notNull(),
    // INFO: RESTRUCTURE.md § 2.3. What it was uploaded for, which is what decides the rules `registerMedia` applies to it.
    scope: text("scope").$type<MediaScope>().notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    // INFO: REQUIREMENTS.md § 8.3. Present wherever there is a box, so the virtualized list can reserve it before the asset loads.
    // WARN: RESTRUCTURE.md § 2.4. Nullable, and `0` is no longer a value it may hold. The sentinel was what forced every reader to test `filename` and `voice` first before trusting these as a ratio; a NULL cannot be mistaken for one, and the CHECK below is what keeps it exactly where the box is.
    width: integer("width"),
    height: integer("height"),
    // WARN: REQUIREMENTS.md § 9.1. The name a file attachment was sent under. No longer a discriminator — `kind` is — but still the payload, and still set by the server from the stored mime rather than taken as the client says it.
    filename: text("filename"),
    // WARN: REQUIREMENTS.md § 9.3. A voice message's waveform. No longer a discriminator either; `kind = 'voice'` is, and the CHECK below ties the two together so neither can appear without the other.
    // WARN: Integers `0`–`VOICE_PEAK_SCALE`, not floats, and always `VOICE_WAVEFORM_PEAKS` of them. `registerMedia` refuses any other shape, and refuses peaks at all on a mime that is not one § 9.3. records into — otherwise a JPEG could be filed as a voice message and would vanish from the library.
    waveformPeaks: smallint("waveform_peaks").array(),
    // INFO: DESIGN.md § 6.5. A video cell draws its running time from this, read off the element that produced the poster frame.
    // WARN: § 9.3. Required for a voice message — the § 8.3. box is fixed, but the player's progress is drawn against this figure and a null reads as a waveform that never moves.
    durationMs: integer("duration_ms"),
    blurhash: text("blurhash"),
    // TODO: RESTRUCTURE.md § 2.8. Read and written nowhere in either repository since `0001`. Declared only until a follow-up change drops it — the drop must not run until the build that stopped naming it is live.
    takenAt: timestamp("taken_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 10. Set only for an object uploaded straight into the library. Everything else earns its place there by hanging off a live message, and an object that has neither is an abandoned upload rather than a photo.
    archiveAddedAt: timestamp("archive_added_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 18. #1. 보관함에서 숨기기, which either participant may do (RESTRUCTURE.md § 4.1.) — the shelf is shared. The bubble the object was sent in keeps rendering it, and the bytes are never touched (§ 4.2.).
    archiveHiddenAt: timestamp("archive_hidden_at", { withTimezone: true }),
    // INFO: RESTRUCTURE.md § 4.3. 완전 삭제, which only the uploader may do. Soft, because `message_media`'s FK and § 8.13.'s resume reconciliation both need the row to survive — only the R2 objects are really removed.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // TODO: RESTRUCTURE.md § 2.8. The two `gallery_*` columns `archive_*` replaced, and § 3.3.'s `created_at`. Declared only until a follow-up change drops all three, for `taken_at`'s reason.
    galleryAddedAt: timestamp("gallery_added_at", { withTimezone: true }),
    galleryHiddenAt: timestamp("gallery_hidden_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    // TODO: RESTRUCTURE.md § 3.4. Dropped with the columns above — the ordering is `id DESC` alone now, which the primary key already serves.
    index("media_created_at_id_idx").on(table.createdAt.desc(), table.id.desc()),
    // WARN: RESTRUCTURE.md § 2.5. The kind's shape is held here rather than in `registerMedia` alone. That function still validates — it has to tell the user *why* — but two deployments write this table and neither can be the guarantee.
    check("media_kind_check", sql`"kind" in ${sql.raw(toSqlList(MEDIA_KINDS))}`),
    check("media_scope_check", sql`"scope" in ${sql.raw(toSqlList(MEDIA_SCOPES))}`),
    check("media_file_has_name_check", sql`"kind" <> 'file' OR "filename" IS NOT NULL`),
    check("media_name_is_file_check", sql`"kind" = 'file' OR "filename" IS NULL`),
    check(
      "media_voice_has_peaks_check",
      sql`"kind" <> 'voice' OR ("waveform_peaks" IS NOT NULL AND "duration_ms" IS NOT NULL)`,
    ),
    check("media_peaks_are_voice_check", sql`"kind" = 'voice' OR "waveform_peaks" IS NULL`),
    // INFO: RESTRUCTURE.md § 2.5. There is deliberately **no** `kind = 'video' → duration_ms IS NOT NULL` check beside the voice one. A recording measures its own duration off the wall clock, so `registerMedia` can insist on it; a picked video is measured by the browser, and `read-draft.ts` sends null wherever `video.duration` is not finite — a real case for a MediaRecorder WebM and for some `.mov` files. A constraint the producer cannot honour turns that upload into a 500 rather than a video with no duration badge.
    // WARN: § 2.4. Both halves are needed. The first keeps a drawn box measured; the second is what actually retires the `0` sentinel, and without it a file row may still carry the numbers that made every reader branch.
    check(
      "media_box_is_visual_check",
      sql`"kind" NOT IN ('image','video') OR ("width" IS NOT NULL AND "height" IS NOT NULL)`,
    ),
    check(
      "media_no_box_when_not_visual_check",
      sql`"kind" IN ('image','video') OR ("width" IS NULL AND "height" IS NULL AND "blurhash" IS NULL)`,
    ),
  ],
);

export type Media = typeof media.$inferSelect;

// INFO: § 2.5. The `in (…)` list is built from the config arrays so a new kind cannot be added in one place and forgotten in the other.
function toSqlList(values: readonly string[]): string {
  return `(${values.map((value) => `'${value}'`).join(", ")})`;
}
