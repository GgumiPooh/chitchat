import "server-only";

import { MESSAGE_PAGE_SIZE } from "@/shared/config";
import { getDb, messages, type Message } from "@/shared/db";
import { and, asc, desc, gt, isNull, lt, lte } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listMessageEmoticons } from "./list-message-emoticons";
import { listMessageMedia } from "./list-message-media";
import { listReplyPreviews } from "./list-reply-previews";

export type ListMessagesParams = {
  /** Older than this id — scrolling into the past (REQUIREMENTS.md § 8.2.). */
  before?: number;
  /** Newer than this id — gap recovery after a dropped stream. */
  after?: number;
  /** Context on both sides of this id — the search jump of REQUIREMENTS.md § 8.6.1. */
  around?: number;
  limit?: number;
};

const IS_VISIBLE = isNull(messages.deletedAt);

/**
 * One cursor page, always oldest-first. Never OFFSET — an arriving message shifts
 * every boundary and the page would repeat or skip rows (REQUIREMENTS.md § 8.2.).
 */
export async function listMessages({
  before,
  after,
  around,
  limit = MESSAGE_PAGE_SIZE,
}: ListMessagesParams = {}): Promise<ChatMessage[]> {
  if (around !== undefined) {
    return listAround(around, limit);
  }

  const db = getDb();

  if (after !== undefined) {
    const rows = await db
      .select()
      .from(messages)
      .where(and(IS_VISIBLE, gt(messages.id, after)))
      .orderBy(asc(messages.id))
      .limit(limit);

    return withMedia(rows);
  }

  const rows = await db
    .select()
    .from(messages)
    .where(before === undefined ? IS_VISIBLE : and(IS_VISIBLE, lt(messages.id, before)))
    .orderBy(desc(messages.id))
    .limit(limit);

  return withMedia(rows.reverse());
}

async function listAround(target: number, limit: number): Promise<ChatMessage[]> {
  const db = getDb();
  const olderCount = Math.ceil(limit / 2);
  const [older, newer] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(IS_VISIBLE, lte(messages.id, target)))
      .orderBy(desc(messages.id))
      .limit(olderCount),
    db
      .select()
      .from(messages)
      .where(and(IS_VISIBLE, gt(messages.id, target)))
      .orderBy(asc(messages.id))
      .limit(limit - olderCount),
  ]);

  return withMedia([...older.reverse(), ...newer]);
}

/**
 * INFO: REQUIREMENTS.md § 9., § 13.6., § 8.9. A few extra queries for the whole page
 * at most, and each only when the page actually holds that kind of row — a text-only
 * conversation with no replies in it pays nothing.
 */
async function withMedia(rows: Message[]): Promise<ChatMessage[]> {
  const mediaIds = rows.filter((row) => row.type === "media").map((row) => row.id);
  const emoticonIds = rows
    .map((row) => row.emoticonItemId)
    .filter((id): id is string => id !== null);
  const parentIds = rows.map((row) => row.replyToId).filter((id): id is number => id !== null);
  const [byMessage, byEmoticonId, byParentId] = await Promise.all([
    listMessageMedia(mediaIds),
    listMessageEmoticons(emoticonIds),
    listReplyPreviews(parentIds),
  ]);

  return rows.map((row) =>
    toChatMessage(
      row,
      byMessage.get(row.id),
      row.emoticonItemId ? (byEmoticonId.get(row.emoticonItemId) ?? null) : null,
      row.replyToId ? (byParentId.get(row.replyToId) ?? null) : null,
    ),
  );
}
