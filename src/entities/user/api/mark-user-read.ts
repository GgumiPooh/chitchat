import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, messages, users } from "@/shared/db";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

/**
 * Advances this user's read cursor to the newest message there is
 * (`REQUIREMENTS.md § 8.8.`).
 *
 * WARN: The "only ever forward" guard is load-bearing twice over. It stops a stale
 * request from a second device walking the cursor backwards, and it makes the UPDATE a
 * no-op when nothing changed — which is what keeps the § 6. `user_changed` trigger
 * quiet under the app's most frequent write (§ 8.4.).
 *
 * INFO: RESTRUCTURE.md § 3.5. `last_read_at` was written here too for the length of one
 * rollout, because the build deployed before the cursor moved to `last_read_message_id`
 * still read it and its badge would have frozen otherwise. That build is gone, so the
 * double write is too — the column is dropped once this one is live (§ 6. rule 1).
 *
 * WARN: The `<` here is SQL against a `bigint` column, not the string comparison
 * `CLAUDE.md § 3.2.` forbids. Postgres orders these numerically; TypeScript would not.
 */
export async function markUserRead(userId: UserId): Promise<void> {
  const newest = sql<string>`(select max(${messages.id}) from ${messages})`;

  await getDb()
    .update(users)
    .set({ lastReadMessageId: newest })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastReadMessageId), lt(users.lastReadMessageId, newest)),
      ),
    );
}
