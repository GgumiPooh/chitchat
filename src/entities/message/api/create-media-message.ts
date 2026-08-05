import "server-only";

import { getDb, messageMedia, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageMedia } from "./list-message-media";

export type CreateMediaMessageParams = {
  senderId: string;
  clientMsgId: string;
  /**
   * Already-registered `media` ids owned by `senderId`, in the order they were picked.
   *
   * WARN: A precondition, not something checked here — `message_media.media_id`
   * carries a foreign key, so an id with no row aborts the transaction. The route
   * clears it with `ownsAllMedia` and answers 400.
   */
  mediaIds: string[];
};

/**
 * One bubble carrying one or more attachments (REQUIREMENTS.md § 6.).
 *
 * WARN: Both writes are in one transaction. The § 6. trigger rejects a
 * `message_media` row whose parent is not a `media` message, and the reverse — a
 * `media` message with no attachments — is deliberately unenforced precisely
 * because the pair commits together here.
 */
export async function createMediaMessage({
  senderId,
  clientMsgId,
  mediaIds,
}: CreateMediaMessageParams): Promise<Nullable<ChatMessage>> {
  const db = getDb();
  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ senderId, type: "media", clientMsgId })
      // INFO: REQUIREMENTS.md § 8.5. Idempotent on `client_msg_id`, so a retried send after a timeout cannot post the same photos twice.
      .onConflictDoNothing({ target: messages.clientMsgId })
      .returning();

    if (!row) {
      return null;
    }

    await tx.insert(messageMedia).values(
      mediaIds.map((mediaId, sortOrder) => ({
        messageId: row.id,
        mediaId,
        sortOrder,
      })),
    );

    return row;
  });

  const row = inserted ?? (await findOwnMessage(clientMsgId, senderId));

  if (!row) {
    return null;
  }

  const byMessage = await listMessageMedia([row.id]);

  return toChatMessage(row, byMessage.get(row.id));
}

// WARN: `client_msg_id` is unique table-wide rather than per sender, so matching on it alone would hand this caller the other user's message on a collision.
async function findOwnMessage(clientMsgId: string, senderId: string) {
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
