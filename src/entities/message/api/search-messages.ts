import { idToDate, type MessageId } from "@/shared/lib";
import "server-only";

import { SEARCH_PAGE_SIZE } from "@/shared/config";
import { getDb, messages } from "@/shared/db";
import { and, count, desc, eq, ilike, isNull, lt } from "drizzle-orm";
import { toSearchExcerpt } from "../model/to-search-excerpt";
import type { MessageSearchResult } from "../model/types";

export type SearchMessagesParams = {
  query: string;
  /** Older than this id — the same keyset cursor § 8.2. pages history on. */
  before?: MessageId;
  limit?: number;
};

// INFO: REQUIREMENTS.md § 8.6.1. Attachments and emoticons carry no text to match, so the search is `text` rows alone rather than a filter applied to the result.
const IS_SEARCHABLE = and(eq(messages.type, "text"), isNull(messages.deletedAt));

/**
 * Substring search over `messages.text` (REQUIREMENTS.md § 8.6.).
 *
 * INFO: `ILIKE` over the `pg_trgm` index, never `to_tsvector`. Postgres has no
 * Korean morphological dictionary on Neon and `'simple'` splits on whitespace
 * alone, so a search for `저녁` would miss the stored `저녁을` — Korean attaches
 * its particles to the noun. Substring matching cannot have that failure.
 */
export async function searchMessages({
  query,
  before,
  limit = SEARCH_PAGE_SIZE,
}: SearchMessagesParams): Promise<MessageSearchResult[]> {
  const rows = await getDb()
    .select({
      id: messages.id,
      senderId: messages.senderId,
      text: messages.text,
    })
    .from(messages)
    .where(
      and(
        IS_SEARCHABLE,
        toMatch(query),
        before === undefined ? undefined : lt(messages.id, before),
      ),
    )
    // INFO: REQUIREMENTS.md § 8.6. Recency, never relevance — chat search answers "where was that thing we talked about", and a BM25-style ranking puts the wrong end of the conversation first.
    .orderBy(desc(messages.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    createdAt: idToDate(row.id).toISOString(),
    excerpt: toSearchExcerpt(row.text ?? "", query),
  }));
}

/**
 * How many messages the query matches, for the `3/12` counter beside the field.
 *
 * INFO: Asked only for the first page. The cursor above cannot say how much is
 * behind it, and a counter that grew as the user stepped through would read as
 * the conversation gaining matches while they searched it.
 */
export async function countMatchingMessages(query: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(messages)
    .where(and(IS_SEARCHABLE, toMatch(query)));

  return row?.total ?? 0;
}

/**
 * WARN: `%`, `_` and the escape character itself are escaped, or a query of `%`
 * matches every message in the conversation and one of `_` matches every message
 * of any length — the user typed characters, not a pattern.
 */
function toMatch(query: string) {
  return ilike(messages.text, `%${query.replace(/[\\%_]/g, "\\$&")}%`);
}
