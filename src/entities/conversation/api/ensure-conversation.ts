import "server-only";

import { CONVERSATION_ID } from "@/shared/config";
import { conversations, getDb } from "@/shared/db";

/**
 * Creates the one conversation if it is missing (REQUIREMENTS.md § 6.). Called at
 * login rather than left to `scripts/seed.ts` alone, so a deployment that skipped
 * the seed does not fail every message insert on its foreign key.
 */
export async function ensureConversation(): Promise<void> {
  await getDb().insert(conversations).values({ id: CONVERSATION_ID }).onConflictDoNothing();
}
