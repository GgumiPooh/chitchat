import "server-only";

import { emoticonPacks, userEmoticonPrefs } from "@/shared/db";
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
 */
export function effectivePackPosition() {
  return sql`coalesce(${userEmoticonPrefs.position}, extract(epoch from ${emoticonPacks.createdAt})::numeric * 1000)`;
}
