import type { EmoticonPackSummary } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { EMOTICON_PACKS_URL } from "@/shared/config";

// WARN: § 13. `all`, which is the one caller entitled to it — the panel draws 이모티콘 and 미니 as two menus and splits this list by `pack.type` itself, so asking per kind would be two caches for a payload the preload warms once.
const PACKS_URL = `${EMOTICON_PACKS_URL}?type=all`;

/**
 * Every pack of either kind, hidden ones included (REQUIREMENTS.md § 13.8.), as
 * summaries.
 *
 * WARN: § 13.6. Summaries and no items — a pack's items are `fetchPackItems`, one tab
 * at a time. This used to ask `?items=1` and carry the whole library, which is the
 * payload the per-tab call replaced.
 *
 * WARN: The hidden ones are the caller's to filter, and only out of what draws a tab.
 * Search reads the whole library on the server.
 */
export async function fetchEmoticonPacks(): Promise<EmoticonPackSummary[]> {
  const response = await request(PACKS_URL);

  if (!response.ok) {
    throw new Error(`GET ${PACKS_URL} responded ${response.status}`);
  }

  const { packs } = (await response.json()) as { packs: EmoticonPackSummary[] };

  return packs;
}
