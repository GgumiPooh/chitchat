import "server-only";

import { getDb, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

export type CreateTextMessageParams = {
  senderId: string;
  clientMsgId: string;
  text: string;
};

/**
 * Idempotent on `client_msg_id` (REQUIREMENTS.md § 8.5.), so a retry after a
 * timed-out send returns the row the first attempt already committed instead of
 * posting the message twice.
 *
 * Answers `null` when the id is taken by a row this sender cannot claim — the
 * caller turns that into a 409.
 */
export async function createTextMessage({
  senderId,
  clientMsgId,
  text,
}: CreateTextMessageParams): Promise<Nullable<ChatMessage>> {
  const db = getDb();
  const [inserted] = await db
    .insert(messages)
    .values({ senderId, type: "text", text, clientMsgId })
    .onConflictDoNothing({ target: messages.clientMsgId })
    .returning();

  if (inserted) {
    return toChatMessage(inserted);
  }

  // WARN: `client_msg_id` is unique across the whole table, not per sender, so matching on it alone would hand this caller the other user's message on a collision.
  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.clientMsgId, clientMsgId),
        eq(messages.senderId, senderId),
        isNull(messages.deletedAt),
      ),
    )
    .limit(1);

  return existing ? toChatMessage(existing) : null;
}
