import "server-only";

import { getDb, messageReactions } from "@/shared/db";
import type { MessageId } from "@/shared/lib";
import { inArray } from "drizzle-orm";
import type { MessageReaction } from "../model/types";

export async function listMessageReactions(
  messageIds: MessageId[],
): Promise<Map<MessageId, MessageReaction[]>> {
  if (messageIds.length === 0) {
    return new Map();
  }

  const rows = await getDb()
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds));

  const result = new Map<MessageId, MessageReaction[]>();

  for (const row of rows) {
    const list = result.get(row.messageId) ?? [];
    list.push({
      messageId: row.messageId,
      userId: row.userId,
      reactionType: row.reactionType as "emoji" | "emoticon",
      emoji: row.emoji,
      emoticonItemId: row.emoticonItemId,
    });
    result.set(row.messageId, list);
  }

  return result;
}
