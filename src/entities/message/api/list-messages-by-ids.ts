import "server-only";

import { getDb, messages } from "@/shared/db";
import type { MessageId, UserId } from "@/shared/lib";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { ChatMessage } from "../model/types";
import { withMedia } from "./list-messages";

/**
 * An arbitrary set of ids, oldest first — one round trip and the same batched
 * joins `listMessages` runs for a page, rather than `getMessage`'s three queries
 * repeated once per id. An id naming no row (or one this caller had no business
 * asking for) is simply absent from the result.
 */
export async function listMessagesByIds(
  ids: MessageId[],
  currentUserId: UserId,
): Promise<ChatMessage[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        inArray(messages.id, ids),
        // INFO: REQUIREMENTS.md § 16.1. 나에게만 보내기 — an id this caller has no business asking for (the other participant's own) is dropped exactly like one naming no row at all.
        or(eq(messages.onlyMe, false), eq(messages.senderId, currentUserId)),
      ),
    )
    .orderBy(asc(messages.id));

  return withMedia(rows);
}
