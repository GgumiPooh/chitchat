import "server-only";

import { getDb, users } from "@/shared/db";
import { asc } from "drizzle-orm";
import { toParticipant } from "../model/to-participant";
import type { Participant } from "../model/types";

/**
 * Every user, for resolving sender names at render time (REQUIREMENTS.md § 8.7.).
 * There is no membership join: § 6. holds `users` at the two participants, and the
 * only path that creates a row is the allow-listed OAuth callback (§ 5.1.).
 */
export async function listUsers(): Promise<Participant[]> {
  // WARN: An explicit projection, not `select()` — REQUIREMENTS.md § 8.4. ships this straight to the browser, and `google_sub` is an identity key that has no business leaving the server.
  const rows = await getDb()
    .select({
      id: users.id,
      // INFO: REQUIREMENTS.md § 8.7. Read because the empty-nickname fallback is the email local part; `toParticipant` applies it and the address goes no further.
      email: users.email,
      nickname: users.nickname,
      avatarMediaId: users.avatarMediaId,
      // INFO: REQUIREMENTS.md § 12.1. The profile cover the other participant sees when they open this person's profile. `chat_background_media_id` is deliberately not projected (§ 12.2.).
      profileBackgroundMediaId: users.profileBackgroundMediaId,
      // INFO: REQUIREMENTS.md § 8.8. The other person's cursor is what the `1` marker reads.
      lastReadAt: users.lastReadAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  return rows.map(toParticipant);
}
