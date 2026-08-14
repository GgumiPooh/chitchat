import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, messages, users } from "@/shared/db";
import { and, count, eq, gt, isNull, ne } from "drizzle-orm";

/**
 * Unread count for the tab-bar badge (`REQUIREMENTS.md § 8.8.`) — messages the
 * other person sent after this user's `last_read_at` cursor.
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
        gt(messages.createdAt, users.lastReadAt),
      ),
    );

  return row?.unread ?? 0;
}
