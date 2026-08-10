import { A_MINUTE } from "@/shared/lib";
import { fetchEmoticonSearch } from "../api/fetch-emoticon-search";

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
export function toEmoticonSearchQuery(query: string) {
  return {
    queryKey: ["emoticon-search", query] as const,
    queryFn: () => fetchEmoticonSearch(query),
    staleTime: A_MINUTE,
  };
}
