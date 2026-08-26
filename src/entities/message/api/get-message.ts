import "server-only";

import { getDb, messages } from "@/shared/db";
import type { MessageId, Nullable } from "@/shared/lib";
import { eq } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";
import { listMessageMedia } from "./list-message-media";
import { listMessageReactions } from "./list-message-reactions";
import { listReplyPreviews } from "./list-reply-previews";

/**
 * One message by id — what the SSE stream resolves a `new_message` or
 * `message_changed` notification into (REQUIREMENTS.md § 8.4., § 8.13.). The
 * payload carries the id and nothing else, so the row is read here rather than
 * trusted from the wire.
 *
 * WARN: `null` means the id names no row, and **nothing else**. It used to mean
 * "deleted" as well, which is what § 8.13.'s stream once read a deletion off —
 * a tombstone is a row the reader still sees, so the deletion now rides the
 * `isDeleted` flag on a message that resolves normally.
 */
export async function getMessage(id: MessageId): Promise<Nullable<ChatMessage>> {
  const [row] = await getDb().select().from(messages).where(eq(messages.id, id)).limit(1);

  if (!row) {
    return null;
  }

  // WARN: REQUIREMENTS.md § 8.13. Ahead of the three joins below, which a tombstone renders none of — and `listMessageMedia` on a deleted photo message would put back exactly what the delete withdrew.
  if (row.deletedAt !== null) {
    return toChatMessage(row);
  }

  // WARN: The emoticon, reactions and the quote must be resolved here too, not only in `listMessages`. This is the path every *live* message takes (§ 8.4.), so leaving either out renders an empty bubble until the reader reloads.
  const [byMessage, byEmoticonId, byParentId, byReaction] = await Promise.all([
    listMessageMedia(row.type === "media" ? [row.id] : []),
    listMessageEmoticons(row.emoticonItemId ? [row.emoticonItemId] : []),
    listReplyPreviews(row.replyToId ? [row.replyToId] : []),
    listMessageReactions([row.id]),
  ]);

  return toChatMessage(
    row,
    byMessage.get(row.id),
    row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
    row.replyToId ? (byParentId.get(row.replyToId) ?? null) : null,
    byReaction.get(row.id) ?? [],
  );
}
