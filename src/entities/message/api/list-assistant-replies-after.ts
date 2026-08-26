import "server-only";

import { getDb, messages } from "@/shared/db";
import type { MessageId, UserId } from "@/shared/lib";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { toChatMessage } from "../model/to-chat-message";
import type { ChatMessage } from "../model/types";

/**
 * Every live `assistant_reply` posted after `afterId`, oldest first — what a
 * queued question catches up on: an answer that finished while it waited never
 * reached the client's own selection.
 */
export async function listAssistantRepliesAfter(
  afterId: MessageId,
  currentUserId: UserId,
): Promise<ChatMessage[]> {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.type, "system"),
        eq(messages.systemAction, "assistant_reply"),
        isNull(messages.deletedAt),
        gt(messages.id, afterId),
        // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — an answer to the other participant's own private question never catches this queued question up.
        or(eq(messages.onlyMe, false), eq(messages.senderId, currentUserId)),
      ),
    )
    .orderBy(asc(messages.id));

  // INFO: An `assistant_reply` row carries no media, emoticon or quote — `toChatMessage`'s defaults are already the right shape, so nothing here needs the joins `listMessages` runs for an ordinary page.
  return rows.map((row) => toChatMessage(row));
}
