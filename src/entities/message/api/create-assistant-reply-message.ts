import "server-only";

import { advanceReadCursor } from "@/entities/user/@x/message";
import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { MessageId, Nullable, UserId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { getReplyPreview } from "./list-reply-previews";

export type CreateAssistantReplyMessageParams = {
  /** The asker — the one participant who sent the question this answers. */
  senderId: UserId;
  /** The composer's own streamId, so the SSE echo dedups against the bubble the client already streamed. */
  clientMsgId: string;
  text: string;
  /** A snapshot of the `llm_agents` row that answered — that table carries no id of its own, so this is the whole of what identifies it. */
  llmProvider: string;
  llmModel: string;
  /** REQUIREMENTS.md § 8.15. The question this answers, so the landed bubble quotes it exactly as the streaming row did — null where the row cannot be resolved, which leaves the answer unquoted rather than unsent. */
  replyToId: Nullable<MessageId>;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — the mode the question was asked in, set once here, at insert. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1., § 8.15. 조용히 보내기 — inherited from the question the same way `onlyMe` is. */
  silent?: boolean;
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
  replyToId,
  onlyMe = false,
  silent = false,
}: CreateAssistantReplyMessageParams): Promise<Nullable<ChatMessage>> {
  // INFO: REQUIREMENTS.md § 8.8. `senderId` is the asker's own row — they are the one who asked and watched the answer stream in, so this counts as their send and advances their cursor exactly as any other does.
  const inserted = await getDb().transaction(async (tx) => {
    const [own] = await tx
      .insert(messages)
      .values({
        id: nextSnowflake<MessageId>(),
        senderId,
        type: "system",
        systemAction: "assistant_reply",
        text,
        llmProvider,
        llmModel,
        replyToId,
        clientMsgId,
        onlyMe,
        silent,
      })
      .onConflictDoNothing({ target: messages.clientMsgId })
      .returning();

    if (own) {
      // WARN: § 16.1. Never under 나에게만 보내기 — the cursor move fires `read_cursor` at the other participant, and that mode must leave no trace there.
      if (!onlyMe) {
        await advanceReadCursor(tx, senderId, own.id);
      }
    }

    return own;
  });

  const row = inserted ?? (await findOwnMessage(clientMsgId, senderId));

  if (!row) {
    return null;
  }

  // INFO: REQUIREMENTS.md § 8.10. Resolved here exactly as `createTextMessage` resolves its own, so the echoed answer carries the quote the streaming row was already drawing.
  return toChatMessage(row, [], null, await getReplyPreview(row.replyToId));
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
