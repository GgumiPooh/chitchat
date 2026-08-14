import "server-only";

import { EMOTICON_PACK_PAGE_SIZE, snowflakeSchema } from "@/shared/config";
import { emoticonItems, emoticonPacks, getDb, userEmoticonPrefs } from "@/shared/db";
import type { EmoticonPackId, Nullable, UserId } from "@/shared/lib";
import { and, asc, eq, ilike, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toEmoticon } from "../model/to-emoticon";
import type {
  Emoticon,
  EmoticonPackPage,
  EmoticonPackSummary,
  EmoticonPackWithItems,
} from "../model/types";
import { effectivePackPosition } from "./effective-pack-position";
import { toLikeLiteral } from "./to-like-literal";

/** Which packs a read is about, before any paging (REQUIREMENTS.md § 13.5.). */
export type EmoticonPackFilter = {
  /** `coalesce(enabled, true)`, so a user with no prefs row still sees the pack (§ 13.1.). */
  enabledOnly?: boolean;
  /** Case-insensitive containment on the pack's name. Blank means no filter, never "match nothing". */
  query?: string;
};

export type EmoticonPackPageQuery = EmoticonPackFilter & {
  cursor?: Nullable<string>;
  limit?: number;
};

/**
 * Every pack the filter names, in this user's order (REQUIREMENTS.md § 13.1.), each
 * carrying the thumbnail it is actually drawn with (§ 13.2.).
 *
 * WARN: § 13.6. Unpaged, and § 13.5.'s 사용중 tab and the picker both need it to stay
 * that way. The picker answers membership questions off this list — its 최근 사용 filter
 * tests `visiblePackIds` and its remembered tab is a `findPack` over it — so a partial
 * list does not show less, it reads as the missing packs having been hidden.
 *
 * WARN: § 13.6. The thumbnail resolution is the server's and cannot move back. The
 * picker used to fall back to `pack.items[0]` in the browser; it holds summaries and no
 * items, so a pack whose `thumbnail_item_id` is null would simply lose its tab icon.
 */
export async function listEmoticonPacks(
  userId: UserId,
  filter: EmoticonPackFilter = {},
): Promise<EmoticonPackSummary[]> {
  return (await selectPackRows(userId, filter)).map(toDrawnSummary);
}

/**
 * One page of § 13.5.'s 이모티콘그룹 검색 tab, keyed on the order the list is drawn in.
 *
 * INFO: `limit + 1` rows are read and the extra one is dropped — whether it arrived is
 * the whole of what `nextCursor` reports, and it costs nothing over asking for `limit`.
 *
 * WARN: The cursor is the sort key itself (`effectivePackPosition`, then id), so a pack
 * moved or created between two pages shifts nothing already read — which an offset does
 * not, and § 13.5.'s drag rewrites those positions while the list is open.
 */
export async function listEmoticonPacksPage(
  userId: UserId,
  query: EmoticonPackPageQuery = {},
): Promise<EmoticonPackPage> {
  const limit = query.limit ?? EMOTICON_PACK_PAGE_SIZE;
  const rows = await selectPackRows(userId, { ...query, limit: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    packs: page.map(toDrawnSummary),
    nextCursor: rows.length > limit && last ? toPackCursor(last.position, last.id) : null,
  };
}

/**
 * The cursor `listEmoticonPacksPage` was handed, or null when it is not one this
 * server wrote.
 *
 * INFO: Exported for the route, which validates the parameter before answering
 * `invalid_request` — the cursor stays opaque to it, and this is the only thing it may
 * ask about one.
 *
 * WARN: The id half goes through `snowflakeSchema` (`CLAUDE.md § 3.2.`) and MUST NOT go
 * back to a shape written out here. It was a uuid pattern, and `0030` renumbered every id
 * to a snowflake without it — so this server issued cursors it then refused, and the tab
 * answered `400` on every page past the first. Nothing caught it because production holds
 * 29 packs against a page of 30, so page two had never been asked for.
 */
export function parseEmoticonPackCursor(cursor: string): Nullable<EmoticonPackCursor> {
  const separator = cursor.indexOf(":");

  if (separator < 0) {
    return null;
  }

  const position = cursor.slice(0, separator);
  const id = packCursorIdSchema.safeParse(cursor.slice(separator + 1));

  if (!POSITION_PATTERN.test(position) || !id.success) {
    return null;
  }

  return { position, id: id.data };
}

/**
 * One pack with its items, as § 13.4.'s pack screen reads it.
 *
 * WARN: § 13.2. `thumbnailItemId` is the pack's **stored** choice here, where
 * `listEmoticonPacks` resolves it. This is the screen the choice is made on, and it
 * marks the chosen cell — resolved, it would mark an item nobody picked as 대표 and
 * offer 대표로 지정 on a pack that has none.
 */
export async function getEmoticonPack(
  packId: EmoticonPackId,
  userId: UserId,
): Promise<Nullable<EmoticonPackWithItems>> {
  const [row] = await selectPackRows(userId, { packId });

  if (!row) {
    return null;
  }

  return { ...toSummary(row), items: await listEmoticonPackItems(packId) };
}

/**
 * Which of the given ids name a pack that exists (REQUIREMENTS.md § 13.5.).
 *
 * WARN: § 13.5. What the prefs handlers validate against, and deliberately **not**
 * `listEmoticonPacks`. A move writes one row; answering "is this a real pack" with a
 * list that fans out every item of every pack to count them, resolves a thumbnail
 * through a lateral join and groups the result put the request back on the library's
 * size that the sparse key had just taken the write off.
 *
 * INFO: § 13.1. No `userId` — a pack has no owner, and the per-user part is the prefs
 * row the caller is about to write rather than the pack it names.
 */
export async function findKnownPackIds(packIds: EmoticonPackId[]): Promise<Set<string>> {
  if (packIds.length === 0) {
    return new Set();
  }

  const rows = await getDb()
    .select({ id: emoticonPacks.id })
    .from(emoticonPacks)
    .where(inArray(emoticonPacks.id, packIds));

  return new Set(rows.map((row) => row.id));
}

/**
 * One pack's items in the shared authoring order (§ 13.1.).
 *
 * INFO: § 13.6. What a picker tab is filled from, one pack at a time — the panel used
 * to be handed every pack's items at once, which is the payload this replaced.
 */
export async function listEmoticonPackItems(packId: EmoticonPackId): Promise<Emoticon[]> {
  const rows = await getDb()
    .select()
    .from(emoticonItems)
    // INFO: RESTRUCTURE.md § 4.4. A retired item is gone from everywhere the user chooses from — the picker, search and 최근 사용 — while every bubble that already carries it renders unchanged.
    .where(and(eq(emoticonItems.packId, packId), isNull(emoticonItems.retiredAt)))
    .orderBy(asc(emoticonItems.sortOrder), asc(emoticonItems.id));

  return rows.map(toEmoticon);
}

/**
 * The packs a read selects, ordered and cut to a page, before anything is read
 * **about** them.
 *
 * WARN: A `LEFT JOIN` onto the prefs, not an inner one. A user who has never
 * reordered anything has no `user_emoticon_prefs` rows at all, and an inner join
 * would show them an empty list rather than every pack — the absent row is the
 * default, not a gap. `effectivePackPosition` is what orders the two kinds together.
 *
 * WARN: `coalesce(enabled, true)`, never `enabled = true`, for that same missing row.
 *
 * WARN: The two-phase shape is what keeps the library's size off the page. Everything a
 * summary carries beyond the pack's own row — the item count, the thumbnail — is read
 * against **this** subquery's output, so a `LIMIT` here is a limit on that work too.
 * Written as one flat select the cut falls after all of it: measured over 10,000 packs,
 * a page of 30 is 4–7ms against 44ms, and the whole list 81ms against 557ms once the
 * packs hold eighteen items each. The whole list is a wash at two items each, which is
 * the shape a synthetic seed has and no real pack does.
 */
function selectPackPage(
  userId: UserId,
  query: EmoticonPackPageQuery & { packId?: EmoticonPackId },
) {
  const cursor = query.cursor ? parseEmoticonPackCursor(query.cursor) : null;
  const conditions: Nullable<SQL>[] = [
    query.packId === undefined ? null : eq(emoticonPacks.id, query.packId),
    query.enabledOnly ? sql`coalesce(${userEmoticonPrefs.enabled}, true) = true` : null,
    // WARN: `toLikeLiteral`, or a query of a single `%` answers with the whole library.
    query.query ? ilike(emoticonPacks.name, `%${toLikeLiteral(query.query)}%`) : null,
    // WARN: One row-value comparison against the **same** pair the `ORDER BY` uses, and the casts are load-bearing — a bind parameter arrives as text, where the key is `numeric` and `bigint`.
    cursor
      ? sql`(${effectivePackPosition()}, ${emoticonPacks.id}) > (${cursor.position}::numeric, ${cursor.id}::bigint)`
      : null,
  ];

  const page = getDb()
    .select({
      id: emoticonPacks.id,
      name: emoticonPacks.name,
      thumbnailItemId: emoticonPacks.thumbnailItemId,
      enabled: userEmoticonPrefs.enabled,
      // INFO: Selected because the cursor is this value — the browser cannot compute it, and a page's last row is where the next one starts.
      position: sql<string>`${effectivePackPosition()}`.as("position"),
    })
    .from(emoticonPacks)
    .leftJoin(
      userEmoticonPrefs,
      and(eq(userEmoticonPrefs.packId, emoticonPacks.id), eq(userEmoticonPrefs.userId, userId)),
    )
    .where(and(...conditions.filter((condition) => condition !== null)))
    // INFO: § 13.5. `created_at` needs no tiebreaker of its own — it is already inside the fallback half of `effectivePackPosition`.
    .orderBy(effectivePackPosition(), asc(emoticonPacks.id))
    .$dynamic();

  return (query.limit === undefined ? page : page.limit(query.limit)).as("pack_page");
}

function selectPackRows(
  userId: UserId,
  query: EmoticonPackPageQuery & { packId?: EmoticonPackId },
) {
  const page = selectPackPage(userId, query);
  // INFO: One alias of `emoticon_items` per question asked of it — the item the pack points at (§ 13.2.), the item it falls back to, and how many it holds.
  const chosenThumbnails = alias(emoticonItems, "chosen_thumbnails");
  const firstItems = alias(emoticonItems, "first_items");
  const countedItems = alias(emoticonItems, "counted_items");
  // INFO: § 13.2. The fallback thumbnail, taken by the `(pack_id, sort_order)` index one row at a time rather than by grouping every item of every pack.
  const firstItem = getDb()
    .select({ id: firstItems.id, updatedAt: firstItems.updatedAt })
    .from(firstItems)
    // WARN: RESTRUCTURE.md § 4.4. The retirement filter belongs here as much as in `listEmoticonPackItems`. Without it the tab icon goes on drawing an item the picker no longer offers, and the fallback stops being "the first of what that list returns" — which is exactly what the line below asserts.
    .where(and(eq(firstItems.packId, page.id), isNull(firstItems.retiredAt)))
    // WARN: The same order `listEmoticonPackItems` returns, or the tab icon is not the cell the grid draws first.
    .orderBy(asc(firstItems.sortOrder), asc(firstItems.id))
    .limit(1)
    .as("first_item");
  // WARN: A correlated subquery in the target list rather than a `GROUP BY` over a join, and `::int` because `count` is `bigint` and would otherwise arrive as a string. Postgres evaluates it **after** the sort and the limit, which is what takes the count off every pack the page does not hold.
  const itemCount = getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(countedItems)
    // WARN: § 4.4. Retired items are not counted, for the reason the cover excludes them: a pack whose only item was retired would report `1개` over a grid that opens empty.
    .where(and(eq(countedItems.packId, page.id), isNull(countedItems.retiredAt)));

  return (
    getDb()
      .select({
        id: page.id,
        name: page.name,
        thumbnailItemId: page.thumbnailItemId,
        thumbnailUpdatedAt: chosenThumbnails.updatedAt,
        firstItemId: firstItem.id,
        firstItemUpdatedAt: firstItem.updatedAt,
        itemCount: sql<number>`(${itemCount})`,
        enabled: page.enabled,
        position: page.position,
      })
      .from(page)
      .leftJoin(chosenThumbnails, eq(chosenThumbnails.id, page.thumbnailItemId))
      // WARN: `LATERAL` is what lets the subquery name the page's `id`, and the `on true` is the join's whole condition — the correlation is inside it.
      .leftJoinLateral(firstItem, sql`true`)
      // WARN: Repeated out here, and not decoration — a join is free to return its input in any order, so the subquery's own `ORDER BY` decides which rows the page holds and this one decides how they are drawn.
      .orderBy(asc(page.position), asc(page.id))
  );
}

type EmoticonPackCursor = {
  position: string;
  id: EmoticonPackId;
};

// WARN: The position is `numeric` and reaches the cursor as the digits Postgres printed, which `::numeric` reads back exactly. Parsing it into a JS number would round the scale off and put the cursor between two packs rather than on one.
const POSITION_PATTERN = /^-?\d+(?:\.\d+)?$/;
const packCursorIdSchema = snowflakeSchema<EmoticonPackId>();

function toPackCursor(position: string, id: string): string {
  return `${position}:${id}`;
}

type PackRow = Awaited<ReturnType<typeof selectPackRows>>[number];

function toSummary(row: PackRow): EmoticonPackSummary {
  return {
    id: row.id,
    name: row.name,
    thumbnailItemId: row.thumbnailItemId,
    thumbnailVersion: toVersion(row.thumbnailUpdatedAt),
    itemCount: row.itemCount,
    // INFO: REQUIREMENTS.md § 13.1. No row means enabled, so creating a pack fans out no rows per user.
    isEnabled: row.enabled ?? true,
  };
}

// INFO: § 13.2. Null survives only for a pack with no items at all, which is the one case that still draws a glyph.
function toDrawnSummary(row: PackRow): EmoticonPackSummary {
  const summary = toSummary(row);

  if (summary.thumbnailItemId !== null) {
    return summary;
  }

  return {
    ...summary,
    thumbnailItemId: row.firstItemId,
    thumbnailVersion: toVersion(row.firstItemUpdatedAt),
  };
}

// INFO: REQUIREMENTS.md § 13.4. `updated_at` in milliseconds, which is what versions the asset URL a thumbnail is fetched by.
function toVersion(updatedAt: Nullable<Date>): Nullable<number> {
  return updatedAt?.getTime() ?? null;
}
