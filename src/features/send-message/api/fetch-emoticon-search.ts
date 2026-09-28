import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_ITEMS_URL, EMOTICON_SEARCH_PAGE_SIZE } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

export type EmoticonSearchPage = {
  emoticons: Emoticon[];
  hasMore: boolean;
  nextOffset: Nullable<number>;
};

/**
 * REQUIREMENTS.md § 13.9. One ranked page of search results, hidden packs included
 * (§ 13.8.).
 *
 * WARN: Ranked on the server and cut to `limit` (`EMOTICON_SEARCH_PAGE_SIZE`) — the
 * order is the answer, so nothing here may re-sort it. Only § 13.9.'s revealed item
 * goes in front, which the picker does because it holds an item the search may not
 * be able to reach yet.
 */
export async function fetchEmoticonSearch(query: string, offset = 0): Promise<EmoticonSearchPage> {
  const url = `${EMOTICON_ITEMS_URL}?q=${encodeURIComponent(query)}&offset=${offset}&limit=${EMOTICON_SEARCH_PAGE_SIZE}`;
  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${url} responded ${response.status}`);
  }

  return (await response.json()) as EmoticonSearchPage;
}
