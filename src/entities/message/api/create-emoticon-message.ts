import "server-only";

import { advanceReadCursor } from "@/entities/user/@x/message";
import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { EmoticonItemId, MessageId, Nullable, UserId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";
import { getReplyPreview } from "./list-reply-previews";

export type CreateEmoticonMessageParams = {
  senderId: UserId;
  clientMsgId: string;
  emoticonItemId: EmoticonItemId;
  /** REQUIREMENTS.md § 8.10. The quoted message; a precondition here, cleared by the route. */
  replyToId?: MessageId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — set once here, at insert; never updated after. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 — set once here, at insert, exactly as `onlyMe` is. */
  silent?: boolean;
};

/**
 * REQUIREMENTS.md § 13.6. Selecting an emoticon sends it immediately — there is no
 * staging step and no caption, which is why this takes one id and nothing else.
 *
 * Idempotent on `client_msg_id` (§ 8.5.), and answers `null` when that id is taken
 * by a row this sender cannot claim — the caller turns that into a 409.
 */
export async function createEmoticonMessage({
  senderId,
  clientMsgId,
  emoticonItemId,
  replyToId,
  onlyMe = false,
  silent = false,
}: CreateEmoticonMessageParams): Promise<Nullable<ChatMessage>> {
  // INFO: REQUIREMENTS.md § 8.8. A sender at the composer has seen everything up to their own message, so the cursor advances in the same transaction as the insert — never on the conflict-retry branch below, since that send already moved it.
  const inserted = await getDb().transaction(async (tx) => {
    const [own] = await tx
      .insert(messages)
      .values({
        id: nextSnowflake<MessageId>(),
        senderId,
        type: "emoticon",
        emoticonItemId,
        clientMsgId,
        replyToId,
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

  const [byEmoticonId, replyTo] = await Promise.all([
    listMessageEmoticons(row.emoticonItemId ? [row.emoticonItemId] : []),
    getReplyPreview(row.replyToId),
  ]);

  return toChatMessage(
    row,
    [],
    row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
    replyTo,
  );
}

// WARN: `client_msg_id` is unique across the whole table, not per sender, so matching on it alone would hand this caller the other user's message on a collision.
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
