import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_ITEMS_URL } from "@/shared/config";

/**
 * The items behind a list of ids (REQUIREMENTS.md § 13.6.).
 *
 * WARN: The answer is not in the order asked and an id whose item is gone is simply
 * missing from it — 최근 사용 keeps its own order and drops what came back short.
 */
export async function fetchEmoticonsByIds(ids: string[]): Promise<Emoticon[]> {
  const url = `${EMOTICON_ITEMS_URL}?ids=${ids.map(encodeURIComponent).join(",")}`;
  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_ITEMS_URL} responded ${response.status}`);
  }

  const { emoticons } = (await response.json()) as { emoticons: Emoticon[] };

  return emoticons;
}
