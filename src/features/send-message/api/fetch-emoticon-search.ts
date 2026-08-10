import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_ITEMS_URL } from "@/shared/config";

/**
 * REQUIREMENTS.md § 13.9. One ranked page of search results, hidden packs included
 * (§ 13.8.).
 *
 * WARN: Ranked on the server and already cut to `EMOTICON_SEARCH_PAGE_SIZE` — the
 * order is the answer, so nothing here may re-sort it. Only § 13.9.'s revealed item
 * goes in front, which the picker does because it holds an item the search may not
 * be able to reach yet.
 */
export async function fetchEmoticonSearch(query: string): Promise<Emoticon[]> {
  const response = await request(`${EMOTICON_ITEMS_URL}?q=${encodeURIComponent(query)}`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_ITEMS_URL} responded ${response.status}`);
  }

  const { emoticons } = (await response.json()) as { emoticons: Emoticon[] };

  return emoticons;
}
