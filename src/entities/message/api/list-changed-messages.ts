import type { MessageId } from "@/shared/lib";
import "server-only";

import { CHANGED_MESSAGES_LIMIT } from "@/shared/config";
import { getDb, messages } from "@/shared/db";
import { and, desc, gte, isNotNull, lte, or } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";
import { listReplyPreviews } from "./list-reply-previews";

/**
 * REQUIREMENTS.md § 8.13.1. Every mutation inside `[from, to]`, which the client
 * sets to the oldest and newest rows it currently holds — the bound is the loaded
 * window and not a span of days, because § 8.6.1.'s jump can park that window
 * years back.
 *
 * INFO: § 8.13. One shape for both mutations. A deletion is a row whose `isDeleted`
 * is now true and an edit is a row whose text is now different, and the client
 * replaces what it holds either way — so neither needs a verdict of its own.
 *
 * WARN: Both ends are inclusive, and **both are required**. Either loaded row can
 * itself have changed since it was read, so an exclusive bound is a row the client
 * could never hear about.
 *
 * WARN: The upper bound is what makes the `limit` below safe. A window parked in
 * the past by § 8.6.1. sits under a conversation that keeps moving, and unbounded
 * above the newest-first limit is spent entirely on changes to rows the client does
 * not hold — dropping every change inside the window it asked about.
 *
 * INFO: Deliberately does **not** filter `deleted_at` — § 8.10. makes the same
 * exception for `listReplyPreviews`. The deleted rows are the answer here.
 */
export async function listChangedMessages(
  from: MessageId,
  to: MessageId,
  limit = CHANGED_MESSAGES_LIMIT,
): Promise<ChatMessage[]> {
  const rows = await getDb()
    .select()
    .from(messages)
    // INFO: `messages_changed_id_idx` is exactly this predicate.
    .where(
      and(
        gte(messages.id, from),
        lte(messages.id, to),
        or(isNotNull(messages.deletedAt), isNotNull(messages.editedAt)),
      ),
    )
    // WARN: Newest-first, which is what makes the limit a **page** rather than a loss: the caller walks `to` down past the oldest row it received and asks again. Ascending, the same loop would have to walk `from` up, and `from` is the bound the window's own start defines.
    .orderBy(desc(messages.id))
    .limit(limit);

  // INFO: REQUIREMENTS.md § 8.13. `messages_edited_is_text_check` makes every edited row a text one, so the quote is the only join a change can need — and a deleted row does not even need that.
  const parentIds = rows
    .filter((row) => row.deletedAt === null)
    .map((row) => row.replyToId)
    .filter((id): id is MessageId => id !== null);
  const byParentId = await listReplyPreviews(parentIds);

  return rows.map((row) =>
    toChatMessage(
      row,
      [],
      null,
      row.deletedAt === null && row.replyToId ? (byParentId.get(row.replyToId) ?? null) : null,
    ),
  );
}
