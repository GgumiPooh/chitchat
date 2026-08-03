import "server-only";

import { CONVERSATION_ID } from "@/shared/config";
import { getDb, messages } from "@/shared/db";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Soft delete. Scoped to the sender, so the `false` return covers "not mine",
 * "already deleted", and "never existed" without telling the caller which.
 */
export async function deleteMessage(id: number, senderId: string): Promise<boolean> {
  const deleted = await getDb()
    .update(messages)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(messages.id, id),
        eq(messages.conversationId, CONVERSATION_ID),
        eq(messages.senderId, senderId),
        isNull(messages.deletedAt),
      ),
    )
    .returning({ id: messages.id });

  return deleted.length > 0;
}
