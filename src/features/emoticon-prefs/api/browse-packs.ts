import type { EmoticonPackPage } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_PACKS_URL } from "@/shared/config";
import type { Nullable } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 13.5. One page of the 이모티콘그룹 검색 tab — the whole library,
 * narrowed by name and walked by cursor.
 *
 * WARN: `q` is sent even when it is blank, and that is what asks for a *page* at all:
 * the route reads paging off the presence of `q`, `cursor` or `limit`, and a request
 * carrying none of the three answers the whole library in one array. A blank one is no
 * filter rather than a filter nothing matches, so the browse state is the same request
 * as a search with the word left out.
 *
 * WARN: No `enabled=1`. That parameter is § 13.5.'s *other* tab; this one is the
 * library, hidden packs included, since turning one back on is what the tab is for.
 */
export async function fetchEmoticonPackPage(
  query: string,
  cursor: Nullable<string>,
): Promise<EmoticonPackPage> {
  const params = new URLSearchParams({ q: query });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const url = `${EMOTICON_PACKS_URL}?${params}`;
  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${url} responded ${response.status}`);
  }

  return (await response.json()) as EmoticonPackPage;
}
