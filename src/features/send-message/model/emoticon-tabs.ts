/**
 * REQUIREMENTS.md § 13.6. The two tabs of the picker that are not packs, and where
 * the remembered one is kept.
 *
 * WARN: Shared with `useEmoticonPreload`, which is why they live here rather than in
 * the panel that draws them. The warm has to heat the tab that will actually open, so
 * it reads the same key through the same fallback — a second spelling of either would
 * warm one tab and open another.
 */
export const RECENTS_TAB = "recents";

// INFO: § 13.8. Where a tap on the composer's underlined word lands, and the one tab reachable without the panel already being open. Never remembered.
export const SEARCH_TAB = "search";

export const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

const PACK_TAB_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Whether a remembered tab could name a pack at all (REQUIREMENTS.md § 13.6.).
 *
 * WARN: § 13.6. The stored value is whatever is sitting in `localStorage` under
 * `ACTIVE_TAB_KEY`, and the panel resolves it to the active tab **unvalidated while
 * the pack list is still pending** — from there it goes into
 * `GET /api/emoticons/packs/{id}/items` as a path segment, with the session cookie on
 * it. A value holding a `/` or a `?` is then a different route on this origin
 * entirely, so this is a guard and not tidiness.
 */
export function isPackTabId(id: string): boolean {
  return PACK_TAB_PATTERN.test(id);
}
