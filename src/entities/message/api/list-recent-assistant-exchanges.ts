import "server-only";

import { getDb, messages } from "@/shared/db";
import { compareId, type MessageId } from "@/shared/lib";
import { and, desc, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessagesByIds } from "./list-messages-by-ids";

/**
 * REQUIREMENTS.md § 8.15. The newest `limit` AI answers together with the
 * questions they quote — oldest first, the pairs every AI question carries
 * whether or not the asker selected anything. An answer whose `reply_to_id` no
 * longer resolves contributes itself alone.
 */
export async function listRecentAssistantExchanges(limit: number): Promise<ChatMessage[]> {
  const replyRows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.type, "system"),
        eq(messages.systemAction, "assistant_reply"),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(limit);

  const questionIds = replyRows
    .map((row) => row.replyToId)
    .filter((id): id is MessageId => id !== null);
  const questions = await listMessagesByIds(questionIds);

  // INFO: An `assistant_reply` row carries no media, emoticon or quote of its own to join — only the question it points at does, which `listMessagesByIds` already resolved.
  return [...questions, ...replyRows.map((row) => toChatMessage(row))].sort((left, right) =>
    compareId(left.id, right.id),
  );
}
