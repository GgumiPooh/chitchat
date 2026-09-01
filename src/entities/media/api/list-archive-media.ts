import "server-only";

import { resolveDisplayName } from "@/entities/user/@x/media";
import {
  ARCHIVE_PAGE_SIZE,
  SHELF_KINDS,
  type ArchiveModeFilter,
  type LibraryShelf,
} from "@/shared/config";
import { getDb, media, messageMedia, messages, users, type Media } from "@/shared/db";
import type { MediaId, Nullable, Optional, UserId } from "@/shared/lib";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
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
 * The tile a page is measured from — one `media` id and nothing beside it. Not a
 * `(created_at, id)` pair to simplify back to: `created_at` defaults to the
 * transaction timestamp, so every attachment of one multi-photo send compared
 * equal on it, and the id alone breaks that tie.
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
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — the viewer this page is drawn for; a tile whose sending message is only visible to the other participant is excluded rather than shown behind a filter. */
  currentUserId: UserId;
  modeFilter?: ArchiveModeFilter;
};

/**
 * One page of one library shelf, newest first (REQUIREMENTS.md § 10.). Ordered by
 * id alone — an id is a total order, so there's no tie to break. `around` wins
 * over the other two rather than combining with them, as `listMessages` resolves
 * the same set (§ 8.2.) — they name different windows.
 */
export async function listArchiveMedia({
  shelf = "gallery",
  before,
  after,
  around,
  limit = ARCHIVE_PAGE_SIZE,
  currentUserId,
  modeFilter = "all",
}: ListArchiveMediaParams): Promise<ArchiveMedia[]> {
  const within = and(isInLibrary(currentUserId, modeFilter), isOfShelf(shelf));
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
 * Ordered ascending and reversed afterwards, never descending — descending from
 * the top of the shelf would answer with the newest rows in the library, a page
 * from somewhere else entirely.
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
 * lands with the neighbours the grid would have had if they had scrolled there. A
 * target not on this shelf (a stale `?target=`, or a row 삭제 took) falls back to
 * the newest page rather than raising. The older half asks for the whole limit and
 * is sliced down afterwards — otherwise a target near the newest could return a
 * short page and stall `useArchiveMedia`'s "is there more" check.
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
 * Whether the target names a row on this shelf. The shelf predicate is part of
 * the lookup, not only of the pages around it — a `media` id from another segment
 * resolves to a real row whose place in this listing does not exist, and centring
 * on it would page from a position no tile of this grid ever occupies.
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
 * 대화에서 보기 and the viewer's top bar (DESIGN.md § 7.10.). A second query rather
 * than a join on the listing above, since `message_media` has no unique index on
 * `media_id` and a joined row set could outgrow the page's limit. `users` is
 * joined here (a to-one FK lookup, unlike the multiplying join above), and the
 * name resolved through `resolveDisplayName`, never read straight off `nickname`
 * (§ 8.7.), so the fallback rule isn't spelled twice. A row with no answer here is
 * one whose message was withdrawn between the two queries (§ 18. #1.).
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
      onlyMe: messages.onlyMe,
    })
    .from(messageMedia)
    .innerJoin(messages, eq(messages.id, messageMedia.messageId))
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(inArray(messageMedia.mediaId, mediaIds), isNull(messages.deletedAt)));

  return new Map(
    rows.map(({ mediaId, messageId, nickname, email, onlyMe }) => [
      mediaId,
      { messageId, senderName: resolveDisplayName({ nickname, email }), onlyMe },
    ]),
  );
}

/**
 * REQUIREMENTS.md § 10. `media` is the library's single source, so a row belongs
 * here because a message that is still visible carries it. Membership only — which
 * shelf a row lands on is `isOfShelf` — since `destroyArchiveMedia` wants this half
 * alone, as 삭제 reaches every shelf.
 */
export function isInLibrary(
  currentUserId: UserId,
  modeFilter: ArchiveModeFilter = "all",
): Optional<SQL> {
  const isPosted = exists(
    getDb()
      .select({ one: sql`1` })
      .from(messageMedia)
      .innerJoin(messages, eq(messages.id, messageMedia.messageId))
      .where(
        and(
          eq(messageMedia.mediaId, media.id),
          isNull(messages.deletedAt),
          // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — a tile whose only sending message is the other participant's onlyMe row has nothing in this library to belong to.
          or(eq(messages.onlyMe, false), eq(messages.senderId, currentUserId)),
          modeFilter === "onlyMe" ? eq(messages.onlyMe, true) : undefined,
          modeFilter === "shared" ? eq(messages.onlyMe, false) : undefined,
        ),
      ),
  );

  // INFO: REQUIREMENTS.md § 18. #1. A destroyed row leaves the shelf outright — there is no object left to draw a tile from, and the bubble it was sent in draws a tombstone in its place.
  return and(isNull(media.deletedAt), isPosted);
}

/**
 * Which segment a row is drawn under (REQUIREMENTS.md § 10.) — the kinds
 * `SHELF_KINDS` maps this shelf to, and nothing else. Replaces a prior ordering
 * trap (`filename`, then `waveform_peaks`, with 사진 as the fallthrough) where a
 * shelf added without a clause here silently spilled into 사진.
 */
export function isOfShelf(shelf: LibraryShelf): Optional<SQL> {
  return inArray(media.kind, [...SHELF_KINDS[shelf]]);
}
