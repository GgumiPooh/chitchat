import "server-only";

import { CONVERSATION_ID } from "@/shared/config";
import { conversationMembers, getDb, messages } from "@/shared/db";
import { and, count, eq, gt, isNull, ne } from "drizzle-orm";

/**
 * Unread count for the tab-bar badge (`REQUIREMENTS.md § 8.8.`) — messages the
 * other person sent after this user's `last_read_at` cursor.
 */
export async function countUnreadMessages(userId: string) {
  const [row] = await getDb()
    .select({ unread: count() })
    .from(messages)
    .innerJoin(
      conversationMembers,
      and(
        eq(conversationMembers.conversationId, messages.conversationId),
        eq(conversationMembers.userId, userId),
      ),
    )
    .where(
      and(
        eq(messages.conversationId, CONVERSATION_ID),
        ne(messages.senderId, userId),
        isNull(messages.deletedAt),
        gt(messages.createdAt, conversationMembers.lastReadAt),
      ),
    );

  return row?.unread ?? 0;
}
