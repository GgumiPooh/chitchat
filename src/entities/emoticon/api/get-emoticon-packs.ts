import "server-only";

import { emoticonItems, emoticonPacks, getDb, userEmoticonPrefs } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon, EmoticonPackSummary, EmoticonPackWithItems } from "../model/types";
import { effectivePackPosition } from "./effective-pack-position";

/**
 * Every pack, in this user's order (REQUIREMENTS.md § 13.1.), each carrying the
 * thumbnail it is actually drawn with (§ 13.2.).
 *
 * WARN: § 13.6. The resolution is the server's now and cannot move back. The picker
 * used to fall back to `pack.items[0]` in the browser; it holds summaries and no
 * items, so a pack whose `thumbnail_item_id` is null would simply lose its tab icon.
 */
export async function listEmoticonPacks(userId: string): Promise<EmoticonPackSummary[]> {
  return (await selectPackRows(userId)).map(toDrawnSummary);
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
  packId: string,
  userId: string,
): Promise<Nullable<EmoticonPackWithItems>> {
  const [row] = await selectPackRows(userId, packId);

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
export async function findKnownPackIds(packIds: string[]): Promise<Set<string>> {
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
export async function listEmoticonPackItems(packId: string): Promise<Emoticon[]> {
  const rows = await getDb()
    .select()
    .from(emoticonItems)
    .where(eq(emoticonItems.packId, packId))
    .orderBy(asc(emoticonItems.sortOrder), asc(emoticonItems.createdAt));

  return rows.map(toEmoticon);
}

/**
 * WARN: A `LEFT JOIN` onto the prefs, not an inner one. A user who has never
 * reordered anything has no `user_emoticon_prefs` rows at all, and an inner join
 * would show them an empty list rather than every pack — the absent row is the
 * default, not a gap. `effectivePackPosition` is what orders the two kinds together.
 */
function selectPackRows(userId: string, packId?: string) {
  // INFO: A second alias of the same table — the join below counts the pack's items, this one reads the single item the pack points at (§ 13.2.).
  const chosenThumbnails = alias(emoticonItems, "chosen_thumbnails");
  const firstItems = alias(emoticonItems, "first_items");
  // INFO: § 13.2. The fallback thumbnail, taken by the `(pack_id, sort_order)` index one row at a time rather than by grouping every item of every pack.
  const firstItem = getDb()
    .select({ id: firstItems.id, updatedAt: firstItems.updatedAt })
    .from(firstItems)
    .where(eq(firstItems.packId, emoticonPacks.id))
    // WARN: The same order `listEmoticonPackItems` returns, or the tab icon is not the cell the grid draws first.
    .orderBy(asc(firstItems.sortOrder), asc(firstItems.createdAt))
    .limit(1)
    .as("first_item");

  return (
    getDb()
      .select({
        id: emoticonPacks.id,
        name: emoticonPacks.name,
        thumbnailItemId: emoticonPacks.thumbnailItemId,
        thumbnailUpdatedAt: chosenThumbnails.updatedAt,
        firstItemId: firstItem.id,
        firstItemUpdatedAt: firstItem.updatedAt,
        itemCount: count(emoticonItems.id),
        enabled: userEmoticonPrefs.enabled,
      })
      .from(emoticonPacks)
      .leftJoin(
        userEmoticonPrefs,
        and(eq(userEmoticonPrefs.packId, emoticonPacks.id), eq(userEmoticonPrefs.userId, userId)),
      )
      .leftJoin(emoticonItems, eq(emoticonItems.packId, emoticonPacks.id))
      .leftJoin(chosenThumbnails, eq(chosenThumbnails.id, emoticonPacks.thumbnailItemId))
      // WARN: `LATERAL` is what lets the subquery name `emoticon_packs.id`, and the `on true` is the join's whole condition — the correlation is inside it.
      .leftJoinLateral(firstItem, sql`true`)
      .where(packId === undefined ? undefined : eq(emoticonPacks.id, packId))
      .groupBy(
        emoticonPacks.id,
        emoticonPacks.name,
        emoticonPacks.thumbnailItemId,
        chosenThumbnails.updatedAt,
        firstItem.id,
        firstItem.updatedAt,
        emoticonPacks.createdAt,
        userEmoticonPrefs.enabled,
        userEmoticonPrefs.position,
      )
      // INFO: § 13.5. `created_at` needs no tiebreaker of its own — it is already inside the fallback half of `effectivePackPosition`.
      .orderBy(effectivePackPosition(), asc(emoticonPacks.id))
  );
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
