import "server-only";

import { getDb, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";
import { listMessageMedia } from "./list-message-media";

/**
 * One message by id — what the SSE stream resolves a `new_message` notification
 * into (REQUIREMENTS.md § 8.4.). The payload carries the id and nothing else, so
 * the row is read here rather than trusted from the wire.
 */
export async function getMessage(id: number): Promise<Nullable<ChatMessage>> {
  const [row] = await getDb()
    .select()
    .from(messages)
    .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
    .limit(1);

  if (!row) {
    return null;
  }

  // WARN: The emoticon must be resolved here too, not only in `listMessages`. This is the path every *live* message takes (§ 8.4.), so leaving it out renders an empty bubble until the reader reloads.
  const [byMessage, byEmoticonId] = await Promise.all([
    listMessageMedia(row.type === "media" ? [row.id] : []),
    listMessageEmoticons(row.emoticonItemId ? [row.emoticonItemId] : []),
  ]);

  return toChatMessage(
    row,
    byMessage.get(row.id),
    row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
  );
}
