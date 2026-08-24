import "server-only";

import { getDb, messages, nextSnowflake, type SystemAction } from "@/shared/db";
import type { EventId, MessageId, Nullable, UserId } from "@/shared/lib";
import type { DbTransaction } from "@/shared/storage";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

export type CreateSystemMessageParams = {
  senderId: UserId;
  action: SystemAction;
  /** Null once the event has been deleted — the notice outlives its row (REQUIREMENTS.md § 6.). */
  eventId: Nullable<EventId>;
  eventTitle: string;
  eventStartsAt: Date;
  /** REQUIREMENTS.md § 16.3. The reminder run writes inside its own transaction, so the notice can be rolled back with the claim that produced it. */
  tx?: DbTransaction;
};

/**
 * REQUIREMENTS.md § 11.5. The calendar's notice in the conversation. It carries a
 * snapshot of the event's title and start, and **no name** — the sentence is
 * composed at render time from `users.nickname` so a rename rewrites past notices
 * too (§ 8.7.).
 *
 * INFO: No `ON CONFLICT` idempotency, unlike § 8.5.'s sends. A system message has
 * no optimistic bubble and no client retry to collide with, so `clientMsgId` is
 * minted here purely to satisfy the column's `NOT NULL UNIQUE`.
 */
export async function createSystemMessage({
  senderId,
  action,
  eventId,
  eventTitle,
  eventStartsAt,
  tx,
}: CreateSystemMessageParams): Promise<ChatMessage> {
  const db = tx ?? getDb();
  const [row] = await db
    .insert(messages)
    .values({
      id: nextSnowflake<MessageId>(),
      senderId,
      type: "system",
      systemAction: action,
      eventId,
      eventTitle,
      eventStartsAt,
      clientMsgId: crypto.randomUUID(),
    })
    .returning();

  return toChatMessage(row);
}
