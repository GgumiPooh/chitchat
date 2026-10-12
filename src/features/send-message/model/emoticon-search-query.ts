import { EMOTICON_SEARCH_PAGE_SIZE } from "@/shared/config";
import { A_MINUTE } from "@/shared/lib";
import { fetchEmoticonSearch, type EmoticonSearchPage } from "../api/fetch-emoticon-search";

/** Initial row count (2 rows * 4 columns = 8 slots) for reveal search. */
export const REVEAL_INITIAL_SEARCH_LIMIT = 8;
/** Additional row count (10 rows * 4 columns = 40 slots) on 더보기 click for reveal search. */
export const REVEAL_MORE_SEARCH_LIMIT = 40;

/**
 * REQUIREMENTS.md § 13.9. One description of a search, keyed by the string that was
 * asked.
 *
 * WARN: The query belongs in the key, or every term shares one cache entry and the
 * row shows the previous word's answer.
 * INFO: A stale window, because keywords are only written from § 13.4.'s authoring
 * screens — separate routes, which the panel is not on while a search is being
 * typed. It is what makes backspacing back to a word already asked free.
 */
export function toEmoticonSearchQuery(query: string, isRevealMode = false) {
  return {
    queryKey: ["emoticon-search", query, isRevealMode ? "reveal" : "direct"] as const,
    queryFn: ({ pageParam = 0 }: { pageParam?: number }) => {
      const limit = isRevealMode
        ? pageParam === 0
          ? REVEAL_INITIAL_SEARCH_LIMIT
          : REVEAL_MORE_SEARCH_LIMIT
        : EMOTICON_SEARCH_PAGE_SIZE;

      return fetchEmoticonSearch(query, pageParam, limit);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: EmoticonSearchPage) => lastPage.nextOffset,
    staleTime: A_MINUTE,
  };
}
