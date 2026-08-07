import "server-only";

import { ARCHIVE_PAGE_SIZE, type LibraryKind } from "@/shared/config";
import { getDb, media, messageMedia, messages } from "@/shared/db";
import type { Optional } from "@/shared/lib";
import { and, desc, eq, exists, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { toArchiveMedia } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";

export type ArchiveCursor = {
  createdAt: string;
  id: string;
};

export type ListArchiveMediaParams = {
  /** Which shelf of the library to page through — 사진 by default (REQUIREMENTS.md § 10.). */
  kind?: LibraryKind;
  /** The last tile of the previous page — everything older than it comes next. */
  before?: ArchiveCursor;
  limit?: number;
};

/**
 * One page of one library shelf, newest first (REQUIREMENTS.md § 10.).
 *
 * WARN: The cursor is the `(created_at, id)` **pair**, never `created_at` alone.
 * `created_at` defaults to the transaction timestamp, so every attachment of one
 * multi-photo send compares equal — a page boundary inside that group would skip
 * or repeat images (§ 6.).
 */
export async function listArchiveMedia({
  kind = "photo",
  before,
  limit = ARCHIVE_PAGE_SIZE,
}: ListArchiveMediaParams = {}): Promise<ArchiveMedia[]> {
  const shelf = and(isInLibrary(), isOfKind(kind));
  const rows = await getDb()
    .select()
    .from(media)
    .where(before ? and(shelf, isOlderThan(before)) : shelf)
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(limit);

  return rows.map(toArchiveMedia);
}

/**
 * INFO: REQUIREMENTS.md § 10. `media` is the library's single source, so a row
 * belongs here either because a message that is still visible carries it, or
 * because it was uploaded straight in. An object with neither is an upload whose
 * send never landed, and it is not something the user ever saw.
 *
 * WARN: Membership only — which **shelf** a row lands on is `isOfKind`, and the
 * two were one predicate until 파일 got a segment of its own. `removeArchiveMedia`
 * wants this half alone, since 삭제 reaches every shelf.
 */
export function isInLibrary(): Optional<SQL> {
  const isPosted = exists(
    getDb()
      .select({ one: sql`1` })
      .from(messageMedia)
      .innerJoin(messages, eq(messages.id, messageMedia.messageId))
      .where(and(eq(messageMedia.mediaId, media.id), isNull(messages.deletedAt))),
  );

  // INFO: REQUIREMENTS.md § 18. #1. The library's own delete, and the only place it is read — a hidden row still renders in the bubble it was sent in.
  return and(isNull(media.galleryHiddenAt), or(isNotNull(media.galleryAddedAt), isPosted));
}

/**
 * Which segment a row is drawn under (REQUIREMENTS.md § 10.).
 *
 * WARN: REQUIREMENTS.md § 9.1. `filename` is the discriminator and the whole of it —
 * a file has no `_thumb` object, so it must never reach the grid, where a tile of one
 * is a broken image and the § 7.10. viewer opens on nothing.
 *
 * WARN: REQUIREMENTS.md § 9.3. A voice message shares `filename IS NULL` with a
 * photo, so 사진 excludes it **explicitly** — without that second clause every
 * recording appears as a tile in the grid, and it has no `_thumb` object either,
 * so the tile is broken and the viewer opens on nothing. 파일 excludes it for free:
 * a recording carries no filename.
 *
 * INFO: Derived, never stored. 음성 cost one clause here and one literal in
 * `LIBRARY_KINDS` — no column and no migration, which is the whole reason § 9.3.
 * took the peaks as its discriminator rather than adding a `kind` enum.
 *
 * WARN: 사진 is "neither of the others", so a fourth kind is two edits and not one.
 * Added to `LIBRARY_KINDS` alone it does not open an empty shelf — it spills into
 * the grid.
 */
function isOfKind(kind: LibraryKind): Optional<SQL> {
  if (kind === "file") {
    return isNotNull(media.filename);
  }

  if (kind === "voice") {
    return isNotNull(media.waveformPeaks);
  }

  return and(isNull(media.filename), isNull(media.waveformPeaks));
}

/**
 * WARN: The timestamp is bound as its ISO **string**, not as a `Date`. A raw
 * template parameter carries no column to take its type from, so drizzle hands it
 * to postgres.js as-is and the driver refuses a `Date` outright.
 *
 * WARN: Which is why both sides are cast. Without `::timestamptz` Postgres has to
 * infer the parameter's type from a row constructor, and an `unknown` there
 * resolves to `text` — where `2026-08-06T…` sorts after `2026-08-1…`.
 *
 * WARN: This is only exact because `media.created_at` is `timestamptz(3)`. The
 * string above came from a JS `Date`, which has no sub-millisecond digits, so at
 * the default microsecond precision the cursor would be a truncated copy of the
 * row it names and every sibling sharing that timestamp would compare greater and
 * be skipped. Never widen the column back.
 */
function isOlderThan({ createdAt, id }: ArchiveCursor): SQL {
  return sql`(${media.createdAt}, ${media.id}) < (${createdAt}::timestamptz, ${id}::uuid)`;
}
