import { idToDate, type MessageId, type UserId } from "@/shared/lib";
import "server-only";

import { SEARCH_PAGE_SIZE, toPlainMessageText } from "@/shared/config";
import { getDb, messages } from "@/shared/db";
import { and, count, desc, eq, ilike, isNull, lt, or, type SQL } from "drizzle-orm";
import { toSearchExcerpt } from "../model/to-search-excerpt";
import type { MessageSearchResult } from "../model/types";

export type SearchMessagesParams = {
  query: string;
  /** Older than this id — the same keyset cursor § 8.2. pages history on. */
  before?: MessageId;
  limit?: number;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — the other participant's own rows are not searchable. */
  currentUserId: UserId;
  hideOthers: boolean;
};

// INFO: REQUIREMENTS.md § 8.6.1. Attachments and emoticons carry no text to match, so the search is `text` rows alone rather than a filter applied to the result.
const IS_SEARCHABLE = and(eq(messages.type, "text"), isNull(messages.deletedAt));

function getSearchVisibility(currentUserId: UserId, hideOthers: boolean): SQL {
  return hideOthers
    ? and(eq(messages.onlyMe, true), eq(messages.senderId, currentUserId))!
    : eq(messages.onlyMe, false);
}

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
  currentUserId,
  hideOthers,
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
        getSearchVisibility(currentUserId, hideOthers),
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
    // INFO: REQUIREMENTS.md § 13. A result row is one line of prose with nothing to draw an emoticon in, so the placeholders come out before the window is cut — left in, they reach the row as tofu and shift the offsets the highlight is measured at.
    excerpt: toSearchExcerpt(toPlainMessageText(row.text ?? ""), query),
  }));
}

/**
 * How many messages the query matches, for the `3/12` counter beside the field.
 *
 * INFO: Asked only for the first page. The cursor above cannot say how much is
 * behind it, and a counter that grew as the user stepped through would read as
 * the conversation gaining matches while they searched it.
 */
export async function countMatchingMessages(query: string, currentUserId: UserId, hideOthers: boolean): Promise<number> {
  const [row] = await getDb()
    .select({ total: count() })
    .from(messages)
    .where(and(IS_SEARCHABLE, getSearchVisibility(currentUserId, hideOthers), toMatch(query)));

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
