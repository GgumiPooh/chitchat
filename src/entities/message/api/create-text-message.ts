import "server-only";

import { getDb, messages, nextSnowflake } from "@/shared/db";
import type { EmoticonItemId, MessageId, Nullable, UserId } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { getReplyPreview } from "./list-reply-previews";

export type CreateTextMessageParams = {
  senderId: UserId;
  clientMsgId: string;
  text: string;
  /**
   * REQUIREMENTS.md § 13. One id per `OBJECT_PLACEHOLDER` in `text`, in that order.
   *
   * WARN: A precondition, exactly as `replyToId` is. The pairing and the existence of
   * every id are the route's to refuse — nothing here re-checks them, and the column
   * carries no foreign key that would.
   */
  inlineEmoticonItemIds?: EmoticonItemId[];
  /**
   * REQUIREMENTS.md § 8.10. The message this one quotes.
   *
   * WARN: A precondition, not something checked here — `reply_to_id` carries a
   * foreign key, so an id with no row aborts the insert. The route clears it and
   * answers 400.
   */
  replyToId?: MessageId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — set once here, at insert; never updated after. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 — set once here, at insert, exactly as `onlyMe` is. */
  silent?: boolean;
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
  inlineEmoticonItemIds = [],
  replyToId,
  onlyMe = false,
  silent = false,
}: CreateTextMessageParams): Promise<Nullable<ChatMessage>> {
  const db = getDb();
  const [inserted] = await db
    .insert(messages)
    .values({
      id: nextSnowflake<MessageId>(),
      senderId,
      type: "text",
      text,
      inlineEmoticonItemIds,
      clientMsgId,
      replyToId,
      onlyMe,
      silent,
    })
    .onConflictDoNothing({ target: messages.clientMsgId })
    .returning();

  const row = inserted ?? (await findOwnMessage(clientMsgId, senderId));

  if (!row) {
    return null;
  }

  return toChatMessage(row, [], null, await getReplyPreview(row.replyToId));
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
