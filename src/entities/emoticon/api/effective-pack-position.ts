import "server-only";

import { emoticonPacks, userEmoticonPrefs } from "@/shared/db";
import { SNOWFLAKE_EPOCH, SNOWFLAKE_TIME_SHIFT } from "@/shared/lib";
import { sql } from "drizzle-orm";

/**
 * Where a pack sits in one user's list (REQUIREMENTS.md § 13.5.) — the sparse key it
 * was last moved to, or its creation time when it has never been moved.
 *
 * WARN: The fallback is the whole design. Both terms land in one numeric space, so a
 * moved pack and an untouched one interleave by value rather than the moved ones all
 * sorting ahead of a single fallback group — which is what used to make writing one
 * pack's row reshuffle the list, and why hiding had to write the whole order first.
 *
 * WARN: One expression for both the list's `ORDER BY` and the midpoint a move is
 * written at. Two spellings would put a pack at a position it does not then sort to.
 *
 * WARN: A factory, and never a shared `sql` value. drizzle's `buildSetOperationQuery`
 * rewrites the `queryChunks` of an `orderBy` expression **in place**, so a single
 * module-level instance handed to `union(...).orderBy(...)` would silently change the
 * ordering of every other query in the process — no error, and the list is still
 * sorted, just not by this. Nothing orders a set operation by it today, which is
 * exactly why the trap is worth removing rather than remembering.
 *
 * WARN: The finished restructure. The fallback reads the id's own timestamp rather than
 * `created_at`, which migration B drops. It reconstructs **milliseconds**, not the raw
 * id: the stored positions are small ordinals backfilled from `sort_order` in `0027`,
 * so the fallback's magnitude decides where every never-moved pack sorts against them.
 * Measured against production, the millisecond form leaves all 58 (user, pack) pairs in
 * exactly the order they were already in, where `id::numeric` moved four of them.
 *
 * WARN: The epoch and the shift are **imported**, never written out here. They are the
 * id format itself (`CLAUDE.md § 4.2.1.`), already mirrored across two repositories,
 * and a literal in this file would be a third copy inside a query nobody would think to
 * check when the format is discussed.
 */
export function effectivePackPosition() {
  // WARN: The column goes through drizzle so it stays table-qualified — this expression is used inside joins where a bare `id` is ambiguous. Only the two constants are raw.
  const shift = sql.raw(String(SNOWFLAKE_TIME_SHIFT));
  const epoch = sql.raw(String(SNOWFLAKE_EPOCH));

  return sql`coalesce(${userEmoticonPrefs.position}, ((${emoticonPacks.id} >> ${shift}) + ${epoch})::numeric)`;
}
