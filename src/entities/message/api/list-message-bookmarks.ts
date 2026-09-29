import type { MessageId, UserId } from "@/shared/lib";
import "server-only";

import { BOOKMARK_PAGE_SIZE } from "@/shared/config";
import { getDb, messageBookmarks, messages } from "@/shared/db";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import type { MessageBookmark } from "../model/types";
import { listReplyPreviews } from "./list-reply-previews";
import { getSearchVisibility } from "./search-messages";

export type ListMessageBookmarksParams = {
  userId: UserId;
  hideOthers: boolean;
  before?: MessageId;
  limit?: number;
};

/** A reader's 책갈피 list, newest bookmarked message first. */
export async function listMessageBookmarks({
  userId,
  hideOthers,
  before,
  limit = BOOKMARK_PAGE_SIZE,
}: ListMessageBookmarksParams): Promise<MessageBookmark[]> {
  const rows = await getDb()
    .select({ messageId: messageBookmarks.messageId, name: messageBookmarks.name })
    .from(messageBookmarks)
    .innerJoin(messages, eq(messages.id, messageBookmarks.messageId))
    .where(
      and(
        eq(messageBookmarks.userId, userId),
        isNull(messages.deletedAt),
        getSearchVisibility(userId, hideOthers),
        before === undefined ? undefined : lt(messageBookmarks.messageId, before),
      ),
    )
    .orderBy(desc(messageBookmarks.messageId))
    .limit(limit);

  const previews = await listReplyPreviews(rows.map((row) => row.messageId));

  return rows.flatMap((row) => {
    const preview = previews.get(row.messageId);

    return preview ? [{ ...preview, name: row.name }] : [];
  });
}

/** Returns all bookmarked message IDs for a user, used to mark bubbles in ChatRoom. */
export async function listAllMessageBookmarkIds(
  userId: UserId,
  hideOthers: boolean,
): Promise<MessageId[]> {
  const rows = await getDb()
    .select({ messageId: messageBookmarks.messageId })
    .from(messageBookmarks)
    .innerJoin(messages, eq(messages.id, messageBookmarks.messageId))
    .where(
      and(
        eq(messageBookmarks.userId, userId),
        isNull(messages.deletedAt),
        getSearchVisibility(userId, hideOthers),
      ),
    )
    .orderBy(desc(messageBookmarks.messageId));

  return rows.map((row) => row.messageId);
}
