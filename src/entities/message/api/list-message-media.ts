import type { MessageId } from "@/shared/lib";
import "server-only";

import { toChatMedia, type ChatMedia } from "@/entities/media/@x/message";
import { getDb, media, messageMedia } from "@/shared/db";
import { asc, eq, inArray } from "drizzle-orm";

/**
 * The attachments for a whole page of messages, keyed by message id.
 *
 * INFO: REQUIREMENTS.md § 9. One query for the page, never one per message — a
 * 30-message page of photos would otherwise be 30 round trips to Neon.
 */
export async function listMessageMedia(
  messageIds: MessageId[],
): Promise<Map<MessageId, ChatMedia[]>> {
  const byMessage = new Map<MessageId, ChatMedia[]>();

  if (messageIds.length === 0) {
    return byMessage;
  }

  const rows = await getDb()
    .select({ messageId: messageMedia.messageId, media })
    .from(messageMedia)
    .innerJoin(media, eq(messageMedia.mediaId, media.id))
    .where(inArray(messageMedia.messageId, messageIds))
    // INFO: REQUIREMENTS.md § 6. `sort_order` is the order the sender picked; without it the grid rearranges between queries.
    .orderBy(asc(messageMedia.messageId), asc(messageMedia.sortOrder));

  for (const row of rows) {
    const bucket = byMessage.get(row.messageId) ?? [];

    bucket.push(toChatMedia(row.media));
    byMessage.set(row.messageId, bucket);
  }

  return byMessage;
}
