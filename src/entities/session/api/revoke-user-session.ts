import "server-only";

import { getDb, sessions } from "@/shared/db";
import { and, eq, ne } from "drizzle-orm";

/**
 * REQUIREMENTS.md § 12. Signs one other device out. Answers whether a row was
 * actually removed, so the route can 404 rather than report a success it did not have.
 *
 * WARN: Scoped to the caller's own `user_id` **and** away from the caller's own
 * session, because the id arrives from the client. Without the first clause one
 * participant could sign the other out of every device they own; without the second a
 * mis-tap would revoke the session running the screen, which § 12. gives the 로그아웃
 * row for — and which would leave a cookie the proxy still accepts (§ 5.2.).
 */
export async function revokeUserSession(
  userId: string,
  sessionId: string,
  currentSessionId: string,
): Promise<boolean> {
  const revoked = await getDb()
    .delete(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.userId, userId),
        ne(sessions.id, currentSessionId),
      ),
    )
    .returning({ id: sessions.id });

  return revoked.length > 0;
}
