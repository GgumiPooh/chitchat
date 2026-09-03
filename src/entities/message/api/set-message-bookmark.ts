import type { MessageId, UserId } from "@/shared/lib";
import "server-only";

import { getDb, messageBookmarks, messages } from "@/shared/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { getSearchVisibility } from "./search-messages";

/**
 * Bookmarks a message for a reader — `false` when the message does not exist, is
 * deleted, or is the other participant's `only_me` row (§ 16.1.'s visibility, not
 * a bookmark-specific rule).
 *
 * INFO: `ON CONFLICT DO NOTHING` and a `true` return either way — re-bookmarking an
 * already-bookmarked message is idempotent rather than a 404.
 */
export async function addMessageBookmark(userId: UserId, messageId: MessageId): Promise<boolean> {
  // INFO: § 16.1.'s two visibility branches read together as "can this user see it".
  const isVisible = or(getSearchVisibility(userId, false), getSearchVisibility(userId, true))!;

  const [row] = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, messageId), isNull(messages.deletedAt), isVisible))
    .limit(1);

  if (!row) {
    return false;
  }

  await getDb().insert(messageBookmarks).values({ messageId, userId }).onConflictDoNothing();

  return true;
}

/** Removes a reader's bookmark — `false` when there was none to remove. */
export async function removeMessageBookmark(
  userId: UserId,
  messageId: MessageId,
): Promise<boolean> {
  const deleted = await getDb()
    .delete(messageBookmarks)
    .where(and(eq(messageBookmarks.messageId, messageId), eq(messageBookmarks.userId, userId)))
    .returning({ messageId: messageBookmarks.messageId });

  return deleted.length > 0;
}

/** Sets a reader's own label on a bookmark — `false` when there was none to rename. */
export async function renameMessageBookmark(
  userId: UserId,
  messageId: MessageId,
  name: string,
): Promise<boolean> {
  const updated = await getDb()
    .update(messageBookmarks)
    .set({ name })
    .where(and(eq(messageBookmarks.messageId, messageId), eq(messageBookmarks.userId, userId)))
    .returning({ messageId: messageBookmarks.messageId });

  return updated.length > 0;
}

/** 전체 해제 — clears every bookmark a reader has set. */
export async function removeAllMessageBookmarks(userId: UserId): Promise<void> {
  await getDb().delete(messageBookmarks).where(eq(messageBookmarks.userId, userId));
}
