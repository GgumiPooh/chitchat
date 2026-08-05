import "server-only";

import { getDb, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";

export type CreateEmoticonMessageParams = {
  senderId: string;
  clientMsgId: string;
  emoticonItemId: string;
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
}: CreateEmoticonMessageParams): Promise<Nullable<ChatMessage>> {
  const db = getDb();
  const [inserted] = await db
    .insert(messages)
    .values({ senderId, type: "emoticon", emoticonItemId, clientMsgId })
    .onConflictDoNothing({ target: messages.clientMsgId })
    .returning();

  const row = inserted ?? (await findOwnMessage(clientMsgId, senderId));

  if (!row) {
    return null;
  }

  const byEmoticonId = await listMessageEmoticons(row.emoticonItemId ? [row.emoticonItemId] : []);

  return toChatMessage(
    row,
    [],
    row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
  );
}

// WARN: `client_msg_id` is unique across the whole table, not per sender, so matching on it alone would hand this caller the other user's message on a collision.
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
