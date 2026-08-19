import "server-only";

import {
  EMOTICON_PACK_PAGE_SIZE,
  snowflakeSchema,
  type EmoticonPackScope,
  type EmoticonPackType,
} from "@/shared/config";
import { emoticonItems, emoticonPacks, getDb, userEmoticonPrefs } from "@/shared/db";
import type { EmoticonPackId, Nullable, UserId } from "@/shared/lib";
import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toEmoticon } from "../model/to-emoticon";
import type {
  Emoticon,
  EmoticonPackPage,
  EmoticonPackSummary,
  EmoticonPackWithItems,
} from "../model/types";
import { effectivePackPosition } from "./effective-pack-position";
import { isChoosable, selectEmoticons } from "./select-emoticons";
import { toLikeLiteral } from "./to-like-literal";

/** Which packs a read is about, before any paging (REQUIREMENTS.md § 13.5.). */
export type EmoticonPackFilter = {
  /**
   * Which kind of pack the read is about (§ 13.).
   *
   * WARN: Required, and it MUST NOT be given a default. Every caller here is a list
   * a user chooses from, and the one failure this feature really has is a mini
   * reaching one of them — a filter that can be omitted is that leak written as an
   * option, where a required field is a compile error at the call site instead.
   *
   * WARN: `"all"` is a value, not an omission — `EMOTICON_PACK_SCOPES` says who may
   * ask for it and why the settings screens may not.
   */
  type: EmoticonPackScope;
  /** `coalesce(enabled, false)`, so a pack nobody has switched on is hidden (§ 13.1.). */
  enabledOnly?: boolean;
  /** Case-insensitive containment on the pack's name. Blank means no filter, never "match nothing". */
  query?: string;
};

export type EmoticonPackPageQuery = EmoticonPackFilter & {
  cursor?: Nullable<string>;
  limit?: number;
  sortBy?: "recent" | "position";
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
  filter: EmoticonPackFilter,
): Promise<EmoticonPackSummary[]> {
  return (await selectPackRows(userId, filter)).map(toDrawnSummary);
}

/**
 * One page of § 13.5.'s 이모티콘 묶음 검색 tab, ordered by creation date descending (newest first).
 *
 * INFO: `limit + 1` rows are read and the extra one is dropped — whether it arrived is
 * the whole of what `nextCursor` reports, and it costs nothing over asking for `limit`.
 *
 * INFO: The cursor is the snowflake id itself, descending by creation date.
 */
export async function listEmoticonPacksPage(
  userId: UserId,
  query: EmoticonPackPageQuery,
): Promise<EmoticonPackPage> {
  const limit = query.limit ?? EMOTICON_PACK_PAGE_SIZE;
  const rows = await selectPackRows(userId, { ...query, sortBy: "recent", limit: limit + 1 });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    packs: page.map(toDrawnSummary),
    nextCursor: rows.length > limit && last ? last.id : null,
  };
}

/**
 * The cursor `listEmoticonPacksPage` was handed, or null when it is not one this
 * server wrote.
 *
 * INFO: Exported for the route, which validates the parameter before answering
 * `invalid_request` — the cursor stays opaque to it, and this is the only thing it may
 * ask about one.
 */
export function parseEmoticonPackCursor(cursor: string): Nullable<string> {
  const directId = packCursorIdSchema.safeParse(cursor);

  if (directId.success) {
    return directId.data;
  }

  const separator = cursor.indexOf(":");

  if (separator >= 0) {
    const id = packCursorIdSchema.safeParse(cursor.slice(separator + 1));
    if (id.success) {
      return id.data;
    }
  }

  return null;
}

/**
 * One pack with its items, as § 13.4.'s pack screen reads it.
 *
 * WARN: § 13.2. `thumbnailItemId` is the pack's **stored** choice here, where
 * `listEmoticonPacks` resolves it. This is the screen the choice is made on, and it
 * marks the chosen cell — resolved, it would mark an item nobody picked as 대표 and
 * offer 대표로 지정 on a pack that has none.
 *
 * WARN: § 13. The kind is part of the lookup rather than a check made afterwards, so a
 * pack of the other kind is simply absent — a 404 on the screen that asked, instead of
 * a mini drawn into a grid sized for the other kind.
 */
export async function getEmoticonPack(
  packId: EmoticonPackId,
  userId: UserId,
  type: EmoticonPackType,
): Promise<Nullable<EmoticonPackWithItems>> {
  const [row] = await selectPackRows(userId, { packId, type });

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
 * The kind of one pack, or null where the id names none (§ 13.).
 *
 * INFO: The one read here that answers the kind rather than taking it — the item write
 * paths need it to know which keyword cap applies, and a required argument there would
 * be the caller asserting the very thing it is asking about.
 */
export async function getEmoticonPackType(
  packId: EmoticonPackId,
): Promise<Nullable<EmoticonPackType>> {
  const [row] = await getDb()
    .select({ type: emoticonPacks.type })
    .from(emoticonPacks)
    .where(eq(emoticonPacks.id, packId))
    .limit(1);

  return row?.type ?? null;
}

/**
 * One pack's items in the shared authoring order (§ 13.1.).
 *
 * INFO: § 13.6. What a picker tab is filled from, one pack at a time — the panel used
 * to be handed every pack's items at once, which is the payload this replaced.
 *
 * INFO: § 13. No kind of its own — the items of one pack are that pack's kind, and the
 * caller reached this id through a list that already named it.
 */
export async function listEmoticonPackItems(packId: EmoticonPackId): Promise<Emoticon[]> {
  const rows = await selectEmoticons()
    // INFO: The finished restructure. A retired item is gone from everywhere the user chooses from — the picker, search and 최근 사용 — while every bubble that already carries it renders unchanged.
    .where(and(eq(emoticonItems.packId, packId), isChoosable(emoticonItems)))
    .orderBy(asc(emoticonItems.sortOrder), asc(emoticonItems.id));

  return rows.map(toEmoticon);
}

/**
 * The packs a read selects, ordered and cut to a page, before anything is read
 * **about** them.
 *
 * WARN: A `LEFT JOIN` onto the prefs, not an inner one. A user who has never
 * reordered anything has no `user_emoticon_prefs` rows at all, and an inner join
 * would show them an empty list rather than every pack — the absent row is a state of
 * its own, not a gap. `effectivePackPosition` is what orders the two kinds together.
 *
 * WARN: `coalesce(enabled, false)`, never `enabled = false`, for that same missing row.
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
  const isRecent = query.sortBy === "recent";
  const cursor = query.cursor ? parseEmoticonPackCursor(query.cursor) : null;
  const conditions: Nullable<SQL>[] = [
    query.packId === undefined ? null : eq(emoticonPacks.id, query.packId),
    query.type === "all" ? null : eq(emoticonPacks.type, query.type),
    query.enabledOnly ? sql`coalesce(${userEmoticonPrefs.enabled}, false) = true` : null,
    // WARN: `toLikeLiteral`, or a query of a single `%` answers with the whole library.
    query.query ? ilike(emoticonPacks.name, `%${toLikeLiteral(query.query)}%`) : null,
    // WARN: One row-value comparison against the **same** pair the `ORDER BY` uses, and the casts are load-bearing — a bind parameter arrives as text, where the key is `numeric` and `bigint`.
    cursor
      ? isRecent
        ? sql`${emoticonPacks.id} < ${cursor}::bigint`
        : sql`(${effectivePackPosition()}, ${emoticonPacks.id}) > (${cursor}::numeric, ${cursor}::bigint)`
      : null,
  ];

  const page = getDb()
    .select({
      id: emoticonPacks.id,
      name: emoticonPacks.name,
      type: emoticonPacks.type,
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
    .orderBy(
      isRecent
        ? desc(emoticonPacks.id)
        : sql`${effectivePackPosition()} asc, ${emoticonPacks.id} asc`,
    )
    .$dynamic();

  return (query.limit === undefined ? page : page.limit(query.limit)).as("pack_page");
}

function selectPackRows(
  userId: UserId,
  query: EmoticonPackPageQuery & { packId?: EmoticonPackId },
) {
  const isRecent = query.sortBy === "recent";
  const page = selectPackPage(userId, query);
  // INFO: One alias of `emoticon_items` per question asked of it — the item the pack points at (§ 13.2.), the item it falls back to, and how many it holds.
  const chosenThumbnails = alias(emoticonItems, "chosen_thumbnails");
  const firstItems = alias(emoticonItems, "first_items");
  const countedItems = alias(emoticonItems, "counted_items");
  // INFO: § 13.2. The fallback thumbnail, taken by the `(pack_id, sort_order)` index one row at a time rather than by grouping every item of every pack.
  const firstItem = getDb()
    .select({ id: firstItems.id, updatedAt: firstItems.updatedAt })
    .from(firstItems)
    // WARN: The finished restructure. The retirement filter belongs here as much as in `listEmoticonPackItems`. Without it the tab icon goes on drawing an item the picker no longer offers, and the fallback stops being "the first of what that list returns" — which is exactly what the line below asserts.
    .where(and(eq(firstItems.packId, page.id), isChoosable(firstItems)))
    // WARN: The same order `listEmoticonPackItems` returns, or the tab icon is not the cell the grid draws first.
    .orderBy(asc(firstItems.sortOrder), asc(firstItems.id))
    .limit(1)
    .as("first_item");
  // WARN: A correlated subquery in the target list rather than a `GROUP BY` over a join, and `::int` because `count` is `bigint` and would otherwise arrive as a string. Postgres evaluates it **after** the sort and the limit, which is what takes the count off every pack the page does not hold.
  const itemCount = getDb()
    .select({ value: sql<number>`count(*)::int` })
    .from(countedItems)
    // WARN: § 4.4. Retired items are not counted, for the reason the cover excludes them: a pack whose only item was retired would report `1개` over a grid that opens empty.
    .where(and(eq(countedItems.packId, page.id), isChoosable(countedItems)));

  return (
    getDb()
      .select({
        id: page.id,
        name: page.name,
        type: page.type,
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
      .orderBy(isRecent ? desc(page.id) : asc(page.position), asc(page.id))
  );
}

const packCursorIdSchema = snowflakeSchema<EmoticonPackId>();

type PackRow = Awaited<ReturnType<typeof selectPackRows>>[number];

function toSummary(row: PackRow): EmoticonPackSummary {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    thumbnailItemId: row.thumbnailItemId,
    thumbnailVersion: toVersion(row.thumbnailUpdatedAt),
    itemCount: row.itemCount,
    // INFO: REQUIREMENTS.md § 13.1. No row means hidden — a pack is in this user's picker only once they have said so.
    isEnabled: row.enabled ?? false,
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
