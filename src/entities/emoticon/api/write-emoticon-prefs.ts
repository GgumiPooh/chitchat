import "server-only";

import { emoticonPacks, getDb, userEmoticonPrefs } from "@/shared/db";
import type { EmoticonPackId, Nullable, UserId } from "@/shared/lib";
import { and, eq, sql } from "drizzle-orm";
import { effectivePackPosition } from "./effective-pack-position";

/**
 * Moves one pack in this user's order (REQUIREMENTS.md § 13.5.). `after` is the pack
 * it lands behind, or null for the front of the list.
 *
 * WARN: One row, and no other pack is touched. `position` is a sparse key rather than
 * an index, so nothing is renumbered and the write does not grow with the library.
 *
 * INFO: § 13.1. The row is written lazily, which is why this upserts rather than
 * updates: a user who has never reordered has no row to update.
 */
export async function setEmoticonPackOrder(
  userId: UserId,
  packId: EmoticonPackId,
  after: Nullable<string>,
): Promise<void> {
  const position = await toMovedPosition(userId, packId, after);

  await getDb()
    .insert(userEmoticonPrefs)
    .values({ userId, packId, position, enabled: true })
    .onConflictDoUpdate({
      target: [userEmoticonPrefs.userId, userEmoticonPrefs.packId],
      // WARN: `enabled` is deliberately untouched on conflict. Reordering must not hide or un-hide a pack, and the insert branch states `true` rather than leaning on the column default — § 13.1. reads a missing row as hidden, and only a pack the user can see is draggable at all.
      set: { position },
    });
}

/**
 * REQUIREMENTS.md § 13.5. Hiding is per-user — the pack itself is untouched and
 * the other participant is unaffected.
 *
 * INFO: The pack's position is deliberately left alone, including when there is no
 * row yet to leave alone. A hidden pack keeps sorting where `effectivePackPosition`
 * already put it, so hiding no longer has to record an order to avoid inventing one.
 */
export async function setEmoticonPackEnabled(
  userId: UserId,
  packId: EmoticonPackId,
  enabled: boolean,
): Promise<void> {
  await getDb()
    .insert(userEmoticonPrefs)
    .values({ userId, packId, enabled })
    .onConflictDoUpdate({
      target: [userEmoticonPrefs.userId, userEmoticonPrefs.packId],
      set: { enabled },
    });
}

export async function getEmoticonPackPref(userId: UserId, packId: EmoticonPackId) {
  const [row] = await getDb()
    .select()
    .from(userEmoticonPrefs)
    .where(and(eq(userEmoticonPrefs.userId, userId), eq(userEmoticonPrefs.packId, packId)))
    .limit(1);

  return row ?? null;
}

/**
 * The point between the moved pack's two new neighbours, in the space
 * `effectivePackPosition` defines.
 *
 * WARN: The neighbours are read by their **effective** position, never by the raw
 * column — a pack that has never been moved has no row at all and would otherwise
 * read as no neighbour.
 *
 * WARN: `* 0.5`, not `/ 2`. `numeric` multiplication is exact and widens the scale by
 * one digit, so a gap can be halved indefinitely; division rounds to the operands' own
 * scale and would eventually land the moved pack on a neighbour's exact value.
 */
async function toMovedPosition(
  userId: UserId,
  packId: EmoticonPackId,
  after: Nullable<string>,
): Promise<string> {
  // INFO: One statement, so the two neighbours are read against a single snapshot rather than drifting between two queries.
  // WARN: That covers the read and nothing past it. `setEmoticonPackOrder` bisects here and upserts separately, so two moves racing over the same gap compute the same midpoint and the second silently lands on top of the first — § 13.5. takes no lock, because the two participants reorder their own lists and a user racing themselves across two devices is a drag they made twice.
  // WARN: Equal ordinals bisect to a value equal to both, and the moved pack's place is then settled by `emoticon_packs.id` in the list's own tiebreaker rather than by the move — the drag can read as having done nothing. Reachable only from two packs created in the same microsecond or two positions backfilled identically, so it is left standing rather than defended against.
  const [row] = await getDb().execute<{ position: string }>(sql`
    with effective as (
      select ${emoticonPacks.id} as pack_id, ${effectivePackPosition()} as ordinal
      from ${emoticonPacks}
      left join ${userEmoticonPrefs}
        on ${and(eq(userEmoticonPrefs.packId, emoticonPacks.id), eq(userEmoticonPrefs.userId, userId))}
      where ${emoticonPacks.deletedAt} is null
    ),
    predecessor as (
      select pack_id, ordinal from effective where pack_id = ${after}::bigint
    ),
    successor as (
      select effective.ordinal
      from effective
      left join predecessor on true
      where effective.pack_id <> ${packId}::bigint
        and (
          predecessor.pack_id is null
          or (effective.ordinal, effective.pack_id) > (predecessor.ordinal, predecessor.pack_id)
        )
      order by effective.ordinal, effective.pack_id
      limit 1
    )
    select
      case
        when predecessor.ordinal is null and successor.ordinal is null then 0
        when predecessor.ordinal is null then successor.ordinal - 1
        when successor.ordinal is null then predecessor.ordinal + 1
        else (predecessor.ordinal + successor.ordinal) * 0.5
      end as "position"
    from (values (1)) as anchor
    left join predecessor on true
    left join successor on true
  `);

  return row.position;
}
