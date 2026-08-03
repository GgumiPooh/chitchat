import "server-only";

import { CONVERSATION_ID } from "@/shared/config";
import { conversationMembers, getDb, users, type User } from "@/shared/db";
import { eq } from "drizzle-orm";

/** The two people in the conversation, for resolving sender names at render time (REQUIREMENTS.md § 8.7.). */
export async function listConversationMembers(): Promise<User[]> {
  return getDb()
    .select({ user: users })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, CONVERSATION_ID))
    .then((rows) => rows.map((row) => row.user));
}
