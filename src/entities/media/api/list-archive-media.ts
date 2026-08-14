import "server-only";

import { resolveDisplayName } from "@/entities/user/@x/media";
import { ARCHIVE_PAGE_SIZE, SHELF_KINDS, type LibraryShelf } from "@/shared/config";
import { getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { MediaId, Nullable, Optional } from "@/shared/lib";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { toArchiveMedia, type ArchiveOrigin } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";

/**
 * The tile a page is measured from — one `media` id and nothing beside it
 * (RESTRUCTURE.md § 3.4.).
 *
 * WARN: This was the `(created_at, id)` **pair** until the id became the whole of
 * the ordering. It is not a simplification to undo: `created_at` defaults to the
 * transaction timestamp, so every attachment of one multi-photo send compared equal
 * on it, and the id was already carried alongside precisely to break that tie.
 *
 * INFO: Which is also why the row-constructor comparison is gone — a single column takes `lt`/`lte`/`gt`, so no operator is interpolated raw and no parameter is cast by hand to keep it off a `text` sort.
 */
export type ArchiveCursor = MediaId;

export type ListArchiveMediaParams = {
  /** Which shelf of the library to page through — 갤러리 by default (REQUIREMENTS.md § 10.). */
  shelf?: LibraryShelf;
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
 * INFO: RESTRUCTURE.md § 3.4. Ordered by id alone. An id is a total order, so the tie a timestamp had to be broken out of does not arise — see `ArchiveCursor` for the one that used to.
 *
 * WARN: `around` wins over the other two rather than combining with them, exactly
 * as `listMessages` resolves the same set (§ 8.2.) — they name different windows.
 */
export async function listArchiveMedia({
  shelf = "gallery",
  before,
  after,
  around,
  limit = ARCHIVE_PAGE_SIZE,
}: ListArchiveMediaParams = {}): Promise<ArchiveMedia[]> {
  const within = and(isInLibrary(), isOfShelf(shelf));
  const rows = around
    ? await selectAround(within, around, limit)
    : after
      ? await selectNewer(within, after, limit)
      : await selectOlder(within, before, limit);
  const sentIn = await findSendingMessages(rows.map((row) => row.id));

  return rows.map((row) => toArchiveMedia(row, sentIn.get(row.id) ?? null));
}

function selectOlder(within: Optional<SQL>, before: Optional<ArchiveCursor>, limit: number) {
  return getDb()
    .select()
    .from(media)
    .where(before ? and(within, lt(media.id, before)) : within)
    .orderBy(desc(media.id))
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
  within: Optional<SQL>,
  after: ArchiveCursor,
  limit: number,
): Promise<Media[]> {
  const rows = await getDb()
    .select()
    .from(media)
    .where(and(within, gt(media.id, after)))
    .orderBy(asc(media.id))
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
  within: Optional<SQL>,
  targetId: MediaId,
  limit: number,
): Promise<Media[]> {
  const target = await findCursor(within, targetId);

  if (!target) {
    return selectOlder(within, undefined, limit);
  }

  const [newer, atOrOlder] = await Promise.all([
    getDb()
      .select()
      .from(media)
      .where(and(within, gt(media.id, target)))
      .orderBy(asc(media.id))
      .limit(Math.floor(limit / 2)),
    getDb()
      .select()
      .from(media)
      // WARN: `lte`, not `lt` — § 10.'s jump is centred on the target, and an exclusive bound here drops the very tile the window was opened for.
      .where(and(within, lte(media.id, target)))
      .orderBy(desc(media.id))
      .limit(limit),
  ]);

  return [...newer.reverse(), ...atOrOlder.slice(0, limit - newer.length)];
}

/**
 * Whether the target names a row **on this shelf**, which is the whole of what the
 * cursor now has to establish (RESTRUCTURE.md § 3.4.).
 *
 * INFO: The shelf predicate is part of the lookup, not only of the pages around
 * it. A `media` id from another segment resolves to a real row whose place in this
 * listing does not exist, and centring on it would page from a position no tile of
 * this grid ever occupies.
 *
 * INFO: The id is the caller's own, so the row is looked up to be tested rather than to be read from — the cursor it used to project is now that same id.
 */
async function findCursor(
  within: Optional<SQL>,
  targetId: MediaId,
): Promise<Nullable<ArchiveCursor>> {
  const [row] = await getDb()
    .select({ id: media.id })
    .from(media)
    .where(and(within, eq(media.id, targetId)))
    .limit(1);

  return row?.id ?? null;
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
 * 갤러리 either — the branch and the second row shape would cost more than the column.
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
 * WARN: Membership only — which **shelf** a row lands on is `isOfShelf`, and the
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
  // WARN: RESTRUCTURE.md § 2.8. `archive_*`, not the `gallery_*` pair it was renamed from — those still exist until migration B and hold the pre-deploy values, so a reader left on one of them and a writer moved to the other is a row that is in 보관함 by one column and not by the other.
  // INFO: RESTRUCTURE.md § 4.3. A row the uploader destroyed leaves the shelf outright rather than being hidden — there is no object left to draw a tile from. The bubble it was sent in still holds its place and draws a tombstone.
  return and(
    isNull(media.deletedAt),
    isNull(media.archiveHiddenAt),
    or(isNotNull(media.archiveAddedAt), isPosted),
  );
}

/**
 * Which segment a row is drawn under (REQUIREMENTS.md § 10., RESTRUCTURE.md § 2.7.) —
 * the kinds `SHELF_KINDS` maps this shelf to, and nothing else.
 *
 * WARN: The ordering trap this function used to be is gone, and the record of it is
 * why the map is where it is. It read `filename`, then `waveform_peaks`, **in that
 * order**, and 사진 was the fallthrough — so a recording tested after 사진 rather
 * than before it appeared as a tile in the grid with no `_thumb` object behind it,
 * and a kind added to the shelf list without a clause here spilled into 사진 instead
 * of opening an empty segment. A shelf now names its kinds and the column answers.
 *
 * INFO: Which is also what let the 사진 shelf be renamed 갤러리 without a query changing — it always held `image` and `video`, and only the fallthrough made that hard to see.
 */
function isOfShelf(shelf: LibraryShelf): Optional<SQL> {
  return inArray(media.kind, [...SHELF_KINDS[shelf]]);
}
