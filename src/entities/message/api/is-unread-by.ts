import "server-only";

import { getDb, messages, users } from "@/shared/db";
import { and, eq, gt, ne } from "drizzle-orm";

/**
 * Whether one message still sits past this user's `last_read_at` cursor —
 * the gate on § 16.1.'s retraction push.
 *
 * WARN: Deliberately does **not** filter `deleted_at IS NULL` the way
 * `countUnreadMessages` does. Its only caller asks after the soft delete has
 * committed, so that predicate would answer `false` for every row.
 */
export async function isMessageUnreadBy(messageId: number, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    // INFO: The join condition pins `users` to the one row, so this reads the cursor without a second round trip.
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(messages.id, messageId),
        ne(messages.senderId, userId),
        gt(messages.createdAt, users.lastReadAt),
      ),
    )
    .limit(1);

  return row !== undefined;
}
