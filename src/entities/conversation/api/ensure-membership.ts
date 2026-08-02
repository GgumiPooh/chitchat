import "server-only";

import { CONVERSATION_ID } from "@/shared/config";
import { conversationMembers, conversations, getDb } from "@/shared/db";

/**
 * Joins the user to the one conversation (REQUIREMENTS.md § 6.). Called at login,
 * because a user row does not exist until that person first signs in — the seed
 * script can only create the conversation itself.
 */
export async function ensureConversationMembership(userId: string): Promise<void> {
  const db = getDb();

  await db.insert(conversations).values({ id: CONVERSATION_ID }).onConflictDoNothing();
  await db
    .insert(conversationMembers)
    // INFO: REQUIREMENTS.md § 8.8. The epoch, so everything sent before this person's first login counts as unread rather than silently read.
    .values({ conversationId: CONVERSATION_ID, userId, lastReadAt: new Date(0) })
    .onConflictDoNothing();
}
