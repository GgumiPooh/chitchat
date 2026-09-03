import type { UserId } from "@/shared/lib";
import "server-only";

import { getDb, messageBookmarks, messages } from "@/shared/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { MessageBookmark } from "../model/types";
import { listReplyPreviews } from "./list-reply-previews";
import { getSearchVisibility } from "./search-messages";

export type ListMessageBookmarksParams = {
  userId: UserId;
  hideOthers: boolean;
};

/** A reader's 책갈피 list, newest bookmarked message first. */
export async function listMessageBookmarks({
  userId,
  hideOthers,
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
      ),
    )
    .orderBy(desc(messageBookmarks.messageId));

  const previews = await listReplyPreviews(rows.map((row) => row.messageId));

  return rows.flatMap((row) => {
    const preview = previews.get(row.messageId);

    return preview ? [{ ...preview, name: row.name }] : [];
  });
}
