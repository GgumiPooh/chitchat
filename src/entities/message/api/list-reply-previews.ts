import "server-only";

import { REPLY_PREVIEW_MAX_LENGTH, toMediaKind } from "@/shared/config";
import { emoticonItems, getDb, messages } from "@/shared/db";
import type { Nullable, Optional } from "@/shared/lib";
import { eq, inArray } from "drizzle-orm";
import type { QuoteThumbnail, ReplyPreview } from "../model/types";
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
      emoticonItemId: messages.emoticonItemId,
      // INFO: REQUIREMENTS.md § 13.4. Joined for this column alone — the tile's URL is versioned by it, and the join is what keeps the quote showing an edited emoticon's correction (§ 8.10.).
      emoticonUpdatedAt: emoticonItems.updatedAt,
    })
    .from(messages)
    .leftJoin(emoticonItems, eq(messages.emoticonItemId, emoticonItems.id))
    .where(inArray(messages.id, parentIds));

  // INFO: DESIGN.md § 6.10. The quote draws the bubble's first attachment as a 32px tile and counts the rest, which have nowhere to go on one line.
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
      // INFO: REQUIREMENTS.md § 9.1., § 9.3. Neither a file attachment nor a recording has a `_thumb` object, so the quote is left with the label alone rather than a tile that 404s.
      // WARN: The deletion is tested here rather than left to the helper, because only the media half gets it for free — `listMessageMedia` is never asked about a deleted row, where the emoticon join above is on `messages` itself and answers for one.
      thumbnail: row.deletedAt ? null : toQuoteThumbnail(row, attachments[0]),
      // INFO: The same rule the § 16.1. push body applies — 동영상 only when there is no photo in the bubble to contradict it.
      mediaKind: toMediaKind(attachments),
      // INFO: DESIGN.md § 6.10. The summary counts what the tile cannot show — it is the first attachment alone, however many were sent.
      mediaCount: attachments.length,
      isDeleted: row.deletedAt !== null,
      id: row.id,
    });
  }

  return byId;
}

// WARN: Structural, not `ChatMedia`. `entities/message` may not import `entities/media` (FSD forbids a cross-import between slices of one layer), and the two fields below are the whole of what this question needs.
type QuotedAttachment = { filename: Nullable<string>; voice: Nullable<unknown>; id: string };

/** The emoticon half of the row above — its id, and the `updated_at` § 13.4. versions the asset by. */
type QuotedEmoticon = { emoticonItemId: Nullable<string>; emoticonUpdatedAt: Nullable<Date> };

/**
 * WARN: Both fields, never `filename` alone. A recording carries no filename either,
 * so testing that one field pointed the quote's `<img>` at an audio object — which
 * `GET /api/media/{id}` now serves as the original — and reserved `QUOTE_THUMBNAIL`
 * in the § 8.3. estimate for a tile that can never draw.
 */
function toQuoteThumbnail(
  { emoticonItemId, emoticonUpdatedAt }: QuotedEmoticon,
  attachment: Optional<QuotedAttachment>,
): Nullable<QuoteThumbnail> {
  // INFO: § 6. A row carries one payload or the other, so the order settles nothing — an emoticon message has no attachments to reach the branch below.
  if (emoticonItemId && emoticonUpdatedAt) {
    return { kind: "emoticon", itemId: emoticonItemId, version: emoticonUpdatedAt.getTime() };
  }

  if (!attachment || attachment.filename || attachment.voice) {
    return null;
  }

  return { kind: "media", mediaId: attachment.id };
}
