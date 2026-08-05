import "server-only";

import { REPLY_PREVIEW_MAX_LENGTH, isVideoMime } from "@/shared/config";
import { getDb, messages } from "@/shared/db";
import type { Nullable } from "@/shared/lib";
import { inArray } from "drizzle-orm";
import type { ReplyPreview } from "../model/types";
import { listMessageMedia } from "./list-message-media";

/** The quote for one reply — what the create paths resolve before they echo the row back. */
export async function getReplyPreview(parentId: Nullable<number>): Promise<Nullable<ReplyPreview>> {
  if (parentId === null) {
    return null;
  }

  const byId = await listReplyPreviews([parentId]);

  return byId.get(parentId) ?? null;
}

/**
 * The quoted messages for a whole page of replies, keyed by the quoted id.
 *
 * INFO: REQUIREMENTS.md § 8.10. One query for the page, for the same reason
 * `listMessageMedia` is one query, and keyed by the *parent* id because a page
 * commonly quotes the same message several times.
 *
 * WARN: Deliberately does not filter `deleted_at`. The row is what the quote reads
 * `isDeleted` off — filtering it here would render a deleted parent as no quote at
 * all rather than as 삭제된 메시지예요.
 */
export async function listReplyPreviews(parentIds: number[]): Promise<Map<number, ReplyPreview>> {
  const byId = new Map<number, ReplyPreview>();

  if (parentIds.length === 0) {
    return byId;
  }

  const rows = await getDb()
    .select({
      id: messages.id,
      senderId: messages.senderId,
      type: messages.type,
      text: messages.text,
      deletedAt: messages.deletedAt,
    })
    .from(messages)
    .where(inArray(messages.id, parentIds));

  // INFO: DESIGN.md § 6.10. The quote shows the bubble's first attachment as a 32px tile; the rest of a nine-photo grid has nowhere to go on one line.
  const byMessage = await listMessageMedia(
    rows.filter((row) => row.type === "media" && !row.deletedAt).map((row) => row.id),
  );

  for (const row of rows) {
    const attachments = byMessage.get(row.id) ?? [];

    byId.set(row.id, {
      senderId: row.senderId,
      kind: row.type,
      // INFO: A deleted parent surrenders its content and keeps only its identity — the quote replaces both with 삭제된 메시지예요.
      text: row.deletedAt ? null : (row.text?.slice(0, REPLY_PREVIEW_MAX_LENGTH) ?? null),
      thumbnailMediaId: attachments[0]?.id ?? null,
      // INFO: The same rule the § 16.1. push body applies — 동영상 only when there is no photo in the bubble to contradict it.
      isVideoOnly: attachments.length > 0 && attachments.every((item) => isVideoMime(item.mime)),
      isDeleted: row.deletedAt !== null,
      id: row.id,
    });
  }

  return byId;
}
