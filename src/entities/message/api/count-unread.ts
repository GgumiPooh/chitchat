import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, messages, users } from "@/shared/db";
import { and, count, eq, isNull, ne, or, sql } from "drizzle-orm";

/**
 * Unread count for the tab-bar badge (`REQUIREMENTS.md § 8.8.`) — messages the
 * other person sent past this user's read cursor.
 *
 * WARN: The finished restructure. `coalesce(…, 0)` is not decoration. A user who has read
 * nothing carries a NULL cursor, and `id > NULL` is NULL rather than true — so without
 * it the badge reads zero for exactly the person who has everything left to read.
 *
 * WARN: The comparison is SQL against two `bigint` columns, not the string comparison
 * `CLAUDE.md § 3.2.` forbids. Postgres orders these numerically.
 */
export async function countUnreadMessages(userId: UserId) {
  const [row] = await getDb()
    .select({ unread: count() })
    .from(messages)
    // INFO: The join condition pins `users` to the one row, so this reads the cursor without a second round trip.
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        ne(messages.senderId, userId),
        isNull(messages.deletedAt),
        // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — the other participant's own row never counts against this user's unread badge.
        or(eq(messages.onlyMe, false), eq(messages.senderId, userId)),
        sql`${messages.id} > coalesce(${users.lastReadMessageId}, 0)`,
      ),
    );

  return row?.unread ?? 0;
}
