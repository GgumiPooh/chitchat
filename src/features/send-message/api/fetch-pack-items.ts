import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_PACKS_URL } from "@/shared/config";

/**
 * One pack's items, in the authoring order both participants share
 * (REQUIREMENTS.md § 13.1.).
 *
 * INFO: § 13.6. The picker's per-tab read. An unknown pack answers an empty list, so
 * a remembered tab whose pack has since been deleted costs a request and draws the
 * tab's own empty state rather than throwing.
 */
export async function fetchPackItems(packId: string): Promise<Emoticon[]> {
  // WARN: Encoded, because the id reaching here can be a remembered tab out of `localStorage` rather than a pack the list handed over — `isPackTabId` is the check, and this is what keeps a value that got past it inside one path segment instead of naming another route on this origin.
  const url = `${EMOTICON_PACKS_URL}/${encodeURIComponent(packId)}/items`;
  const response = await request(url);

  if (!response.ok) {
    throw new Error(`GET ${url} responded ${response.status}`);
  }

  const { items } = (await response.json()) as { items: Emoticon[] };

  return items;
}
