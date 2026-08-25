import "server-only";

import { getDb, messages } from "@/shared/db";
import type { MessageId } from "@/shared/lib";
import { asc, inArray } from "drizzle-orm";
import type { ChatMessage } from "../model/types";
import { withMedia } from "./list-messages";

/**
 * An arbitrary set of ids, oldest first — one round trip and the same batched
 * joins `listMessages` runs for a page, rather than `getMessage`'s three queries
 * repeated once per id. An id naming no row (or one this caller had no business
 * asking for) is simply absent from the result.
 */
export async function listMessagesByIds(ids: MessageId[]): Promise<ChatMessage[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await getDb()
    .select()
    .from(messages)
    .where(inArray(messages.id, ids))
    .orderBy(asc(messages.id));

  return withMedia(rows);
}
