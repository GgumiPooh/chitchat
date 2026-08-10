import { request } from "@/shared/api";
import { EMOTICON_ITEMS_URL } from "@/shared/config";

/**
 * Every keyword in the library, hidden packs included (REQUIREMENTS.md § 13.8.).
 *
 * WARN: § 13.8. The strings alone. The underline used to be flattened out of
 * § 13.6.'s preloaded packs — the whole library, items and all, to answer a question
 * about words — and this is that question asked directly.
 */
export async function fetchEmoticonKeywords(): Promise<string[]> {
  const response = await request(`${EMOTICON_ITEMS_URL}?keywords=1`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_ITEMS_URL} responded ${response.status}`);
  }

  const { keywords } = (await response.json()) as { keywords: string[] };

  return keywords;
}
