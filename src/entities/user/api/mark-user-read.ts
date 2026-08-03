import "server-only";

import { getDb, users } from "@/shared/db";
import { and, eq, lt } from "drizzle-orm";

/**
 * Advances this user's read cursor to now (`REQUIREMENTS.md § 8.8.`).
 *
 * WARN: The `last_read_at < now()` guard is load-bearing twice over. It stops a
 * stale request from a second device walking the cursor backwards, and it makes
 * the UPDATE a no-op when nothing changed — which is what keeps the § 6.
 * `user_changed` trigger quiet under the app's most frequent write (§ 8.4.).
 */
export async function markUserRead(userId: string): Promise<void> {
  const readAt = new Date();

  await getDb()
    .update(users)
    .set({ lastReadAt: readAt })
    .where(and(eq(users.id, userId), lt(users.lastReadAt, readAt)));
}
