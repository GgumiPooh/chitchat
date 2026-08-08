import "server-only";

import { CHANGED_MESSAGES_LIMIT } from "@/shared/config";
import { getDb, messages, type Message } from "@/shared/db";
import { and, desc, gte, inArray, isNotNull, lte, or } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listReplyPreviews } from "./list-reply-previews";

/**
 * REQUIREMENTS.md § 8.13.1. What a resuming client has to be told about rows it
 * already holds: which are gone, and which now read differently.
 *
 * INFO: A deletion is acted on from the id alone, so it costs one number. An edit
 * carries the whole corrected row rather than a verdict the client would have to
 * spend a second round trip resolving — edits are rare enough that the payload is
 * empty in the ordinary case and small in every other.
 */
export type MessageChanges = {
  deletedIds: number[];
  edited: ChatMessage[];
};

/**
 * REQUIREMENTS.md § 8.13.1. Every mutation inside `[from, to]`, which the client
 * sets to the oldest and newest rows it currently holds — the bound is the loaded
 * window and not a span of days, because § 8.6.1.'s jump can park that window
 * years back.
 *
 * WARN: Both ends are inclusive, and **both are required**. Either loaded row can
 * itself have been edited since it was read, so an exclusive bound is a row the
 * client could never hear about.
 *
 * WARN: The upper bound is what makes the `limit` below safe. A window parked in
 * the past by § 8.6.1. sits under a conversation that keeps moving, and unbounded
 * above the newest-first limit is spent entirely on changes to rows the client does
 * not hold — dropping every change inside the window it asked about.
 *
 * INFO: Deliberately does **not** filter `deleted_at` the way every other read path
 * does — § 8.10. makes the same exception for `listReplyPreviews`, and for the same
 * reason: the deleted rows are the answer here rather than something to hide.
 */
export async function listChangedMessages(
  from: number,
  to: number,
  limit = CHANGED_MESSAGES_LIMIT,
): Promise<MessageChanges> {
  const rows = await getDb()
    .select({ id: messages.id, deletedAt: messages.deletedAt })
    .from(messages)
    // INFO: `messages_changed_id_idx` is exactly this predicate.
    .where(
      and(
        gte(messages.id, from),
        lte(messages.id, to),
        or(isNotNull(messages.deletedAt), isNotNull(messages.editedAt)),
      ),
    )
    // WARN: Newest-first, and the limit is what truncates. Ascending would spend the limit on the oldest changes and drop the recent ones — the changes most likely to be on screen.
    .orderBy(desc(messages.id))
    .limit(limit);

  const deletedIds = rows.filter((row) => row.deletedAt !== null).map((row) => row.id);
  const editedIds = rows.filter((row) => row.deletedAt === null).map((row) => row.id);

  return { deletedIds, edited: await listEditedRows(editedIds) };
}

/**
 * INFO: REQUIREMENTS.md § 8.13. `messages_edited_is_text_check` makes every edited
 * row a text one, so this resolves the quote and nothing else — there is no
 * attachment and no emoticon to join, unlike `listMessages`.
 */
async function listEditedRows(ids: number[]): Promise<ChatMessage[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await getDb().select().from(messages).where(inArray(messages.id, ids));
  const parentIds = rows.map((row) => row.replyToId).filter((id): id is number => id !== null);
  const byParentId = await listReplyPreviews(parentIds);

  return rows.map((row: Message) =>
    toChatMessage(row, [], null, row.replyToId ? (byParentId.get(row.replyToId) ?? null) : null),
  );
}
