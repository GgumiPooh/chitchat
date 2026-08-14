import "server-only";

import { resolveDisplayName } from "@/entities/user/@x/media";
import { ARCHIVE_PAGE_SIZE, type LibraryKind } from "@/shared/config";
import { getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { MediaId, Nullable, Optional } from "@/shared/lib";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { toArchiveMedia, type ArchiveOrigin } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";

export type ArchiveCursor = {
  createdAt: string;
  id: MediaId;
};

export type ListArchiveMediaParams = {
  /** Which shelf of the library to page through — 사진 by default (REQUIREMENTS.md § 10.). */
  kind?: LibraryKind;
  /** The last tile of the previous page — everything older than it comes next. */
  before?: ArchiveCursor;
  /** The first tile of the loaded window — the page directly newer than it, for the upward paging of REQUIREMENTS.md § 10. */
  after?: ArchiveCursor;
  /** A `media` id the window is to be centred on, for the position jump of REQUIREMENTS.md § 10. */
  around?: MediaId;
  limit?: number;
};

/**
 * One page of one library shelf, newest first (REQUIREMENTS.md § 10.).
 *
 * WARN: The cursor is the `(created_at, id)` **pair**, never `created_at` alone.
 * `created_at` defaults to the transaction timestamp, so every attachment of one
 * multi-photo send compares equal — a page boundary inside that group would skip
 * or repeat images (§ 6.).
 *
 * WARN: `around` wins over the other two rather than combining with them, exactly
 * as `listMessages` resolves the same set (§ 8.2.) — they name different windows.
 */
export async function listArchiveMedia({
  kind = "photo",
  before,
  after,
  around,
  limit = ARCHIVE_PAGE_SIZE,
}: ListArchiveMediaParams = {}): Promise<ArchiveMedia[]> {
  const shelf = and(isInLibrary(), isOfKind(kind));
  const rows = around
    ? await selectAround(shelf, around, limit)
    : after
      ? await selectNewer(shelf, after, limit)
      : await selectOlder(shelf, before, limit);
  const sentIn = await findSendingMessages(rows.map((row) => row.id));

  return rows.map((row) => toArchiveMedia(row, sentIn.get(row.id) ?? null));
}

function selectOlder(shelf: Optional<SQL>, before: Optional<ArchiveCursor>, limit: number) {
  return getDb()
    .select()
    .from(media)
    .where(before ? and(shelf, comparedToCursor("<", before)) : shelf)
    .orderBy(desc(media.createdAt), desc(media.id))
    .limit(limit);
}

/**
 * The page directly newer than the window's first tile (REQUIREMENTS.md § 10.).
 *
 * WARN: Ordered **ascending** and reversed afterwards, never descending. Descending
 * from the top of the shelf would answer with the newest rows in the library, which
 * is a page from somewhere else entirely; ascending from the cursor is the only
 * ordering that returns the rows contiguous with the window being extended.
 */
async function selectNewer(
  shelf: Optional<SQL>,
  after: ArchiveCursor,
  limit: number,
): Promise<Media[]> {
  const rows = await getDb()
    .select()
    .from(media)
    .where(and(shelf, comparedToCursor(">", after)))
    .orderBy(asc(media.createdAt), asc(media.id))
    .limit(limit);

  return rows.reverse();
}

/**
 * REQUIREMENTS.md § 10. The window 보관함 opens on when 채팅 hands it a photo's id —
 * half the page newer than that tile and the rest at or older than it, so the reader
 * lands with the neighbours the grid would have had if they had scrolled there.
 *
 * WARN: A target that is not on this shelf falls back to the newest page rather than
 * raising. `?target=` is a URL anybody can type, and it also names a row that 삭제
 * may have taken out from under the link since it was drawn — a shelf that renders
 * its own first page is the honest answer to both, where an error page is not.
 *
 * WARN: The older half asks for the **whole** limit and is sliced down afterwards.
 * `useArchiveMedia` reads "is there more behind this" off the page's own length, so
 * a target within half a page of the newest — where the newer query can only answer
 * with a handful of rows — would otherwise return a short page and stop paging the
 * shelf at the very first screenful.
 */
async function selectAround(
  shelf: Optional<SQL>,
  targetId: MediaId,
  limit: number,
): Promise<Media[]> {
  const target = await findCursor(shelf, targetId);

  if (!target) {
    return selectOlder(shelf, undefined, limit);
  }

  const [newer, atOrOlder] = await Promise.all([
    getDb()
      .select()
      .from(media)
      .where(and(shelf, comparedToCursor(">", target)))
      .orderBy(asc(media.createdAt), asc(media.id))
      .limit(Math.floor(limit / 2)),
    getDb()
      .select()
      .from(media)
      .where(and(shelf, comparedToCursor("<=", target)))
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(limit),
  ]);

  return [...newer.reverse(), ...atOrOlder.slice(0, limit - newer.length)];
}

/**
 * INFO: The `shelf` predicate is part of the lookup, not only of the pages around
 * it. A `media` id from another segment resolves to a real row whose place in this
 * listing does not exist, and centring on it would page from a position no tile of
 * this grid ever occupies.
 */
async function findCursor(
  shelf: Optional<SQL>,
  targetId: MediaId,
): Promise<Nullable<ArchiveCursor>> {
  const [row] = await getDb()
    .select({ createdAt: media.createdAt, id: media.id })
    .from(media)
    .where(and(shelf, eq(media.id, targetId)))
    .limit(1);

  return row ? { createdAt: row.createdAt.toISOString(), id: row.id } : null;
}

/**
 * REQUIREMENTS.md § 10. Which message carries each tile and who sent it — for
 * 대화에서 보기 and for the viewer's top bar (DESIGN.md § 7.10.).
 *
 * WARN: A second query rather than a join on the listing above. `message_media`
 * has no unique index on `media_id`, so a joined row set can be longer than the
 * page it was limited to — which would both repeat a tile and spend a slot of the
 * page on the repeat, with the keyset cursor none the wiser.
 *
 * INFO: `users` **is** joined, here and not there. That warning is about a join that
 * can multiply rows; this one is a foreign key to a primary key inside the query that
 * already runs, so it adds a lookup per row and no rows at all. It is not gated on
 * 사진 either — the branch and the second row shape would cost more than the column.
 *
 * WARN: The name is resolved through `resolveDisplayName`, never read straight off
 * `nickname` (REQUIREMENTS.md § 8.7.) — an empty nickname falls back to the email's
 * local part, and spelling that rule a second time here is how the two drift.
 *
 * INFO: A row with no answer here is the ordinary library-only upload (§ 10.), or
 * one whose message was deleted; both leave the control off the viewer rather than
 * offering a jump into nothing, and neither has anyone to name.
 */
async function findSendingMessages(mediaIds: MediaId[]): Promise<Map<string, ArchiveOrigin>> {
  if (mediaIds.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select({
      mediaId: messageMedia.mediaId,
      messageId: messages.id,
      nickname: users.nickname,
      email: users.email,
    })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(inArray(messageMedia.mediaId, mediaIds), isNull(messages.deletedAt)));

  return new Map(
    rows.map(({ mediaId, messageId, nickname, email }) => [
      mediaId,
      { messageId, senderName: resolveDisplayName({ nickname, email }) },
    ]),
  );
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
 *
 * WARN: The operator is interpolated raw because a row-constructor comparison has
 * no drizzle helper to express it. It is a literal of `PairOperator` at every call
 * site and must never become a value read off a request.
 *
 * WARN: `<=` is the one that includes the row the cursor names, and § 10.'s jump
 * needs exactly that — a `<` there drops the very tile the window is centred on.
 */
function comparedToCursor(operator: PairOperator, { createdAt, id }: ArchiveCursor): SQL {
  return sql`(${media.createdAt}, ${media.id}) ${sql.raw(operator)} (${createdAt}::timestamptz, ${id}::bigint)`;
}

type PairOperator = "<" | "<=" | ">";
