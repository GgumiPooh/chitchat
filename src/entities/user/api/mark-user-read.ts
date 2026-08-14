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
 * WARN: RESTRUCTURE.md § 3.5. Both columns are written for now. `last_read_at` is what
 * the currently deployed build still reads, and migration B does not drop it until that
 * build is gone (§ 6. rule 1) — writing only the new one would make every unread badge
 * on the old build read zero for the length of the deploy.
 *
 * WARN: The `<` here is SQL against a `bigint` column, not the string comparison
 * `CLAUDE.md § 3.2.` forbids. Postgres orders these numerically; TypeScript would not.
 */
export async function markUserRead(userId: UserId): Promise<void> {
  const readAt = new Date();
  const newest = sql<string>`(select max(${messages.id}) from ${messages})`;

  await getDb()
    .update(users)
    .set({ lastReadAt: readAt, lastReadMessageId: newest })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastReadMessageId), lt(users.lastReadMessageId, newest)),
        lt(users.lastReadAt, readAt),
      ),
    );
}
