import "server-only";

import { emoticonItems, emoticonPacks, getDb, userEmoticonPrefs } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { toEmoticon } from "../model/to-emoticon";
import type { Emoticon, EmoticonPackSummary, EmoticonPackWithItems } from "../model/types";

/**
 * Every pack, in this user's order (REQUIREMENTS.md § 13.1.).
 *
 * WARN: A `LEFT JOIN`, not an inner one. A user who has never reordered anything
 * has no `user_emoticon_prefs` rows at all, and an inner join would show them an
 * empty list rather than every pack — the absent row is the default, not a gap.
 * `sort_order` falls back to a value past every real one, so packs with no
 * opinion recorded sort after those with one, then by creation.
 */
export async function listEmoticonPacks(userId: string): Promise<EmoticonPackSummary[]> {
  // INFO: A second alias of the same table — the join below counts the pack's items, this one reads the single item the pack points at (§ 13.2.).
  const thumbnailItems = alias(emoticonItems, "thumbnail_items");

  const rows = await getDb()
    .select({
      id: emoticonPacks.id,
      name: emoticonPacks.name,
      thumbnailItemId: emoticonPacks.thumbnailItemId,
      thumbnailUpdatedAt: thumbnailItems.updatedAt,
      createdAt: emoticonPacks.createdAt,
      itemCount: count(emoticonItems.id),
      enabled: userEmoticonPrefs.enabled,
      sortOrder: userEmoticonPrefs.sortOrder,
    })
    .from(emoticonPacks)
    .leftJoin(
      userEmoticonPrefs,
      and(eq(userEmoticonPrefs.packId, emoticonPacks.id), eq(userEmoticonPrefs.userId, userId)),
    )
    .leftJoin(emoticonItems, eq(emoticonItems.packId, emoticonPacks.id))
    .leftJoin(thumbnailItems, eq(thumbnailItems.id, emoticonPacks.thumbnailItemId))
    .groupBy(
      emoticonPacks.id,
      emoticonPacks.name,
      emoticonPacks.thumbnailItemId,
      thumbnailItems.updatedAt,
      emoticonPacks.createdAt,
      userEmoticonPrefs.enabled,
      userEmoticonPrefs.sortOrder,
    )
    .orderBy(
      sql`coalesce(${userEmoticonPrefs.sortOrder}, 32767)`,
      asc(emoticonPacks.createdAt),
      asc(emoticonPacks.id),
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    thumbnailItemId: row.thumbnailItemId,
    thumbnailVersion: row.thumbnailUpdatedAt?.getTime() ?? null,
    itemCount: row.itemCount,
    // INFO: REQUIREMENTS.md § 13.1. No row means enabled, so creating a pack fans out no rows per user.
    isEnabled: row.enabled ?? true,
  }));
}

/**
 * The picker's source: **every** pack, hidden ones included, each with its items in
 * authoring order (§ 13.6.).
 *
 * WARN: § 13.8. Deliberately not filtered to `isEnabled`. Hiding a pack takes it out
 * of the picker's *tabs*, and search looks across the whole library — an emoticon
 * the other participant sends from a pack this user has hidden has to be findable by
 * its own words, or § 13.9.'s 따라하기 has nothing to land on. The caller filters
 * for anything that draws a tab.
 */
export async function listEmoticonPacksWithItems(userId: string): Promise<EmoticonPackWithItems[]> {
  const packs = await listEmoticonPacks(userId);

  if (packs.length === 0) {
    return [];
  }

  const items = await listEmoticonsByPacks(packs.map((pack) => pack.id));

  return packs.map((pack) => ({ ...pack, items: items.get(pack.id) ?? [] }));
}

export async function getEmoticonPack(
  packId: string,
  userId: string,
): Promise<Nullable<EmoticonPackWithItems>> {
  const pack = (await listEmoticonPacks(userId)).find((candidate) => candidate.id === packId);

  if (!pack) {
    return null;
  }

  const items = await listEmoticonsByPacks([packId]);

  return { ...pack, items: items.get(packId) ?? [] };
}

// INFO: One query for every pack on the screen, rather than one per pack — the § 9. read path takes the same shape for a page of chat media.
async function listEmoticonsByPacks(packIds: string[]): Promise<Map<string, Emoticon[]>> {
  const rows = await getDb()
    .select()
    .from(emoticonItems)
    .where(inArray(emoticonItems.packId, packIds))
    .orderBy(asc(emoticonItems.packId), asc(emoticonItems.sortOrder), asc(emoticonItems.createdAt));

  const grouped = new Map<string, Emoticon[]>();

  for (const row of rows) {
    const bucket = grouped.get(row.packId);
    const emoticon = toEmoticon(row);

    if (bucket) {
      bucket.push(emoticon);
      continue;
    }

    grouped.set(row.packId, [emoticon]);
  }

  return grouped;
}
