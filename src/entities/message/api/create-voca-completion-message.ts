import "server-only";

import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { MessageId, UserId } from "@/shared/lib";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

export type CreateVocaCompletionMessageParams = {
  senderId: UserId;
  count: number;
};

export async function createVocaCompletionMessage({
  senderId,
  count,
}: CreateVocaCompletionMessageParams): Promise<ChatMessage> {
  const db = getDb();
  const [row] = await db
    .insert(messages)
    .values({
      id: nextSnowflake<MessageId>(),
      senderId,
      type: "system",
      systemAction: "voca_completed",
      text: String(count),
      clientMsgId: crypto.randomUUID(),
    })
    .returning();

  return toChatMessage(row);
}
