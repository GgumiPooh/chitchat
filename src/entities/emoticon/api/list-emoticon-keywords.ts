import "server-only";

import { MAX_EMOTICON_KEYWORD_LIST } from "@/shared/config";
import { emoticonKeywords, getDb } from "@/shared/db";
import { asc } from "drizzle-orm";

/**
 * Every keyword the library has, once each (REQUIREMENTS.md § 13.8.).
 *
 * WARN: § 13.8. Strings and nothing else. This is the composer's underline set,
 * which asks only whether a typed word has *something* behind it — what is behind it
 * is § 13.9.'s search, one tap later, and answering it here is the payload § 13.6.
 * stopped sending.
 *
 * WARN: § 13.9.1. Folded, since that is how the index stores them.
 * `matchesKeywordQuery` folds both sides, so this is the same set the authored
 * `keywords` array offered — a caller comparing unfolded would silently lose `OK`.
 *
 * INFO: Read off `emoticon_keywords` rather than flattened out of the items: the
 * trigger already maintains exactly this set, and a sorted `DISTINCT` is answered
 * from that btree without touching `emoticon_items` at all.
 *
 * WARN: § 13.8. Bounded by `MAX_EMOTICON_KEYWORD_LIST`, and the cost this bounds is
 * the payload rather than the scan — the index answers the `DISTINCT` in a few
 * milliseconds at any size the app will reach. The `ORDER BY` is what makes the
 * truncation reproducible: past the cap the tail of the collation stops underlining,
 * which is § 13.8.'s ceiling saying so instead of a room entry quietly growing by a
 * megabyte.
 */
export async function listEmoticonKeywords(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ keyword: emoticonKeywords.keyword })
    .from(emoticonKeywords)
    .orderBy(asc(emoticonKeywords.keyword))
    .limit(MAX_EMOTICON_KEYWORD_LIST);

  return rows.map((row) => row.keyword);
}
