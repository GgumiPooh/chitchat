import "server-only";

import { getDb, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { and, eq, isNull } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
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

  const byMessage = await listMessageMedia(row.type === "media" ? [row.id] : []);

  return toChatMessage(row, byMessage.get(row.id));
}
