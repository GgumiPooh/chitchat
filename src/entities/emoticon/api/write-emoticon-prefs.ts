import "server-only";

import { getDb, userEmoticonPrefs } from "@/shared/db";
import { and, eq, sql } from "drizzle-orm";

/**
 * Writes this user's pack order (REQUIREMENTS.md § 13.5.).
 *
 * WARN: The whole ordered list, not a single moved pack. `sort_order` is positional,
 * so moving one pack renumbers every pack after it — a per-pack write would need the
 * client to send the same recomputation anyway, and a half-applied one leaves two
 * packs claiming the same slot.
 *
 * INFO: § 13.1. The rows are written lazily, which is why this upserts rather than
 * updates: a user who has never reordered has no rows to update.
 */
export async function setEmoticonPackOrder(userId: string, packIds: string[]): Promise<void> {
  if (packIds.length === 0) {
    return;
  }

  await getDb()
    .insert(userEmoticonPrefs)
    .values(packIds.map((packId, index) => ({ userId, packId, sortOrder: index })))
    .onConflictDoUpdate({
      target: [userEmoticonPrefs.userId, userEmoticonPrefs.packId],
      // WARN: `enabled` is deliberately untouched. Reordering must not un-hide a pack, and the insert branch's default of `true` is only ever reached by a pack that had no row and was therefore already enabled.
      set: { sortOrder: sql`excluded.${sql.raw(userEmoticonPrefs.sortOrder.name)}` },
    });
}

/**
 * REQUIREMENTS.md § 13.5. Hiding is per-user — the pack itself is untouched and
 * the other participant is unaffected.
 *
 * WARN: Takes the whole list in its current order, not just the pack being hidden.
 * `sort_order` is positional and a user who has never reordered has no rows, so
 * writing one pack's row alone would sort it against every other pack's fallback
 * (`listEmoticonPacks`) and silently reshuffle the list on the very first hide.
 */
export async function setEmoticonPackEnabled(
  userId: string,
  packId: string,
  enabled: boolean,
  orderedPackIds: string[],
): Promise<void> {
  await setEmoticonPackOrder(userId, orderedPackIds);

  await getDb()
    .insert(userEmoticonPrefs)
    .values({ userId, packId, enabled, sortOrder: orderedPackIds.indexOf(packId) })
    .onConflictDoUpdate({
      target: [userEmoticonPrefs.userId, userEmoticonPrefs.packId],
      set: { enabled },
    });
}

export async function getEmoticonPackPref(userId: string, packId: string) {
  const [row] = await getDb()
    .select()
    .from(userEmoticonPrefs)
    .where(and(eq(userEmoticonPrefs.userId, userId), eq(userEmoticonPrefs.packId, packId)))
    .limit(1);

  return row ?? null;
}
