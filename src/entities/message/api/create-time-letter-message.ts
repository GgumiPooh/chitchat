import "server-only";

import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { MessageId, Nullable, TimeLetterId, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

export type CreateTimeLetterMessageParams = {
  senderId: UserId;
  letterId: TimeLetterId;
  title: Nullable<string>;
  tx?: DbTransaction;
};

// INFO: Inserts a timeline system notice announcing a delivered time machine letter.
export async function createTimeLetterMessage({
  senderId,
  letterId,
  title,
  tx,
}: CreateTimeLetterMessageParams): Promise<ChatMessage> {
  const db = tx ?? getDb();
  const [row] = await db
    .insert(messages)
    .values({
      id: nextSnowflake<MessageId>(),
      senderId,
      type: "system",
      systemAction: "time_letter_delivered",
      text: JSON.stringify({ letterId, title: title ?? "" }),
      clientMsgId: crypto.randomUUID(),
    })
    .returning();

  return toChatMessage(row);
}
