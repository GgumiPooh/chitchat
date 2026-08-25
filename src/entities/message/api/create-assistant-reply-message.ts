import "server-only";

import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { MessageId, Nullable, UserId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

export type CreateAssistantReplyMessageParams = {
  /** The asker — the one participant who sent the question this answers. */
  senderId: UserId;
  /** The composer's own streamId, so the SSE echo dedups against the bubble the client already streamed. */
  clientMsgId: string;
  text: string;
  /** A snapshot of the `llm_agents` row that answered — that table carries no id of its own, so this is the whole of what identifies it. */
  llmProvider: string;
  llmModel: string;
};

/**
 * Idempotent on `client_msg_id`, exactly as `createTextMessage` is — a retried
 * insert after a dropped connection returns the row the first attempt already
 * committed rather than posting the answer twice.
 */
export async function createAssistantReplyMessage({
  senderId,
  clientMsgId,
  text,
  llmProvider,
  llmModel,
}: CreateAssistantReplyMessageParams): Promise<Nullable<ChatMessage>> {
  const db = getDb();
  const [inserted] = await db
    .insert(messages)
    .values({
      id: nextSnowflake<MessageId>(),
      senderId,
      type: "system",
      systemAction: "assistant_reply",
      text,
      llmProvider,
      llmModel,
      clientMsgId,
    })
    .onConflictDoNothing({ target: messages.clientMsgId })
    .returning();

  const row = inserted ?? (await findOwnMessage(clientMsgId, senderId));

  return row ? toChatMessage(row) : null;
}

async function findOwnMessage(clientMsgId: string, senderId: UserId) {
  const [existing] = await getDb()
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

  return existing ?? null;
}
