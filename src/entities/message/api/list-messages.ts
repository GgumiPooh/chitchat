import "server-only";

import { MESSAGE_PAGE_SIZE } from "@/shared/config";
import { getDb, messages, type Message } from "@/shared/db";
import type { EmoticonItemId, MessageId, Optional, UserId } from "@/shared/lib";
import { and, asc, desc, eq, gt, lt, lte, type SQL } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";
import { listMessageMedia } from "./list-message-media";
import { listMessageReactions } from "./list-message-reactions";
import { listReplyPreviews } from "./list-reply-previews";

export type ListMessagesParams = {
  /** Older than this id — scrolling into the past (REQUIREMENTS.md § 8.2.). */
  before?: MessageId;
  /** Newer than this id — gap recovery after a dropped stream. */
  after?: MessageId;
  /** Context on both sides of this id — the search jump of REQUIREMENTS.md § 8.6.1. */
  around?: MessageId;
  limit?: number;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — a row is in the page only when it isn't one, or it is one this user sent. Omitted only by callers with no per-user viewer (there are none left; every read path threads this). */
  currentUserId?: UserId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — when true, narrows the page to only the rows this user sent under that mode; the viewer sees exactly N visible rows rather than N rows filtered client-side. */
  onlyMeFilter?: boolean;
};

// INFO: REQUIREMENTS.md § 16.1. `undefined` (no viewer named) excludes nothing — only used where a caller genuinely has no per-user scope.
function isVisibleTo(currentUserId: Optional<UserId>, onlyMeFilter = false): Optional<SQL> {
  if (currentUserId === undefined) {
    return undefined;
  }

  return onlyMeFilter
    ? and(eq(messages.onlyMe, true), eq(messages.senderId, currentUserId))
    : eq(messages.onlyMe, false);
}

/**
 * One cursor page, always oldest-first. Never OFFSET — an arriving message shifts
 * every boundary and the page would repeat or skip rows (REQUIREMENTS.md § 8.2.).
 *
 * WARN: REQUIREMENTS.md § 8.13. Deliberately does **not** filter `deleted_at`. A
 * deleted message keeps its place in the timeline as 삭제된 메시지예요, so removing
 * the row here would take the tombstone with it — and the page would come back
 * short of `MESSAGE_PAGE_SIZE`, which `hasOlder` reads as the end of history.
 */
export async function listMessages({
  before,
  after,
  around,
  limit = MESSAGE_PAGE_SIZE,
  currentUserId,
  onlyMeFilter = false,
}: ListMessagesParams = {}): Promise<ChatMessage[]> {
  if (around !== undefined) {
    return listAround(around, limit, currentUserId, onlyMeFilter);
  }

  const db = getDb();
  const visible = isVisibleTo(currentUserId, onlyMeFilter);

  if (after !== undefined) {
    const rows = await db
      .select()
      .from(messages)
      .where(and(gt(messages.id, after), visible))
      .orderBy(asc(messages.id))
      .limit(limit);

    return withMedia(rows);
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(before === undefined ? undefined : lt(messages.id, before), visible))
    .orderBy(desc(messages.id))
    .limit(limit);

  return withMedia(rows.reverse());
}

async function listAround(
  target: MessageId,
  limit: number,
  currentUserId: Optional<UserId>,
  onlyMeFilter = false,
): Promise<ChatMessage[]> {
  const db = getDb();
  const visible = isVisibleTo(currentUserId, onlyMeFilter);
  const olderCount = Math.ceil(limit / 2);
  const [older, newer] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(lte(messages.id, target), visible))
      .orderBy(desc(messages.id))
      .limit(olderCount),
    db
      .select()
      .from(messages)
      .where(and(gt(messages.id, target), visible))
      .orderBy(asc(messages.id))
      .limit(limit - olderCount),
  ]);

  return withMedia([...older.reverse(), ...newer]);
}

/**
 * INFO: REQUIREMENTS.md § 9., § 13.6., § 8.10. A few extra queries for the whole page
 * at most, and each only when the page actually holds that kind of row — a text-only
 * conversation with no replies in it pays nothing.
 *
 * WARN: REQUIREMENTS.md § 8.13. A deleted row is resolved for none of the three. The
 * tombstone draws no attachment, no emoticon and no quote, so joining them is work
 * nothing renders — and it would put the media ids of a deleted photo on the wire,
 * which is the one thing deleting it was meant to take back.
 */
export async function withMedia(rows: Message[]): Promise<ChatMessage[]> {
  const live = rows.filter((row) => row.deletedAt === null);
  const liveIds = live.map((row) => row.id);
  const mediaIds = live.filter((row) => row.type === "media").map((row) => row.id);
  const emoticonIds = live
    .map((row) => row.emoticonItemId)
    .filter((id): id is EmoticonItemId => id !== null);
  const parentIds = live.map((row) => row.replyToId).filter((id): id is MessageId => id !== null);
  const [byMessage, byEmoticonId, byParentId, byReaction] = await Promise.all([
    listMessageMedia(mediaIds),
    listMessageEmoticons(emoticonIds),
    listReplyPreviews(parentIds),
    listMessageReactions(liveIds),
  ]);

  return rows.map((row) =>
    toChatMessage(
      row,
      byMessage.get(row.id),
      row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
      row.replyToId ? (byParentId.get(row.replyToId) ?? null) : null,
      byReaction.get(row.id) ?? [],
    ),
  );
}
