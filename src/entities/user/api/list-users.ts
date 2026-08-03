import "server-only";

import { getDb, users, type User } from "@/shared/db";
import { asc } from "drizzle-orm";

/** REQUIREMENTS.md § 8.4. The `GET /api/users` payload — what a browser is allowed to know about a participant. */
export type Participant = Pick<User, "id" | "email" | "nickname" | "avatarMediaId" | "lastReadAt">;

/**
 * Every user, for resolving sender names at render time (REQUIREMENTS.md § 8.7.).
 * There is no membership join: § 6. holds `users` at the two participants, and the
 * only path that creates a row is the allow-listed OAuth callback (§ 5.1.).
 */
export async function listUsers(): Promise<Participant[]> {
  // WARN: An explicit projection, not `select()` — REQUIREMENTS.md § 8.4. ships this straight to the browser, and `google_sub` is an identity key that has no business leaving the server.
  return getDb()
    .select({
      id: users.id,
      // INFO: REQUIREMENTS.md § 8.7. Carried because the empty-nickname fallback is the email local part.
      email: users.email,
      nickname: users.nickname,
      avatarMediaId: users.avatarMediaId,
      // INFO: REQUIREMENTS.md § 8.8. The other person's cursor is what the `1` marker reads.
      lastReadAt: users.lastReadAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));
}
