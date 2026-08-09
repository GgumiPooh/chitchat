import type { EmoticonPackWithItems } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_PACKS_URL } from "@/shared/config";

/**
 * Every pack with its items, hidden packs included (REQUIREMENTS.md § 13.8.).
 *
 * WARN: The hidden ones are the caller's to filter, and only out of what draws a
 * tab. Search reads the whole answer.
 */
export async function fetchPacksWithItems(): Promise<EmoticonPackWithItems[]> {
  const response = await request(`${EMOTICON_PACKS_URL}?items=1`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_PACKS_URL} responded ${response.status}`);
  }

  const { packs } = (await response.json()) as { packs: EmoticonPackWithItems[] };

  return packs;
}
