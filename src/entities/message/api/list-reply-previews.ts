import "server-only";

import { REPLY_PREVIEW_MAX_LENGTH, toMediaKind, toQuoteThumbnail } from "@/shared/config";
import { emoticonItems, getDb, messages } from "@/shared/db";
import type { EmoticonItemId, MessageId, Nullable } from "@/shared/lib";
import { eq, inArray } from "drizzle-orm";
import type { ReplyPreview } from "../model/types";
import { listMessageMedia } from "./list-message-media";

/** The quote for one reply — what the create paths resolve before they echo the row back. */
export async function getReplyPreview(
  parentId: Nullable<MessageId>,
): Promise<Nullable<ReplyPreview>> {
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
export async function listReplyPreviews(
  parentIds: MessageId[],
): Promise<Map<MessageId, ReplyPreview>> {
  const byId = new Map<MessageId, ReplyPreview>();

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
      // WARN: The deletion is tested here rather than left to the helper, because only the media half gets it for free — `listMessageMedia` is never asked about a deleted row, where the emoticon join above is on `messages` itself and answers for one.
      thumbnail: row.deletedAt ? null : toQuoteThumbnail(toQuotedEmoticon(row), attachments),
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

/**
 * The joined columns as `toQuoteThumbnail` names them — plumbing for the left join,
 * never the rule itself, which `@/shared/config` owns for both callers.
 *
 * INFO: REQUIREMENTS.md § 13.4. `updated_at` in milliseconds is what `Emoticon.version` is, so a quote and a bubble address the same edited asset by the same URL.
 *
 * INFO: Both fields are tested because the left join makes both nullable, not because they are two states — `updated_at` is `NOT NULL`, so the pair is null together exactly when the row carries no emoticon.
 */
function toQuotedEmoticon({
  emoticonItemId,
  emoticonUpdatedAt,
}: {
  emoticonItemId: Nullable<EmoticonItemId>;
  emoticonUpdatedAt: Nullable<Date>;
}): Nullable<{ version: number; id: string }> {
  if (!emoticonItemId || !emoticonUpdatedAt) {
    return null;
  }

  return { id: emoticonItemId, version: emoticonUpdatedAt.getTime() };
}
