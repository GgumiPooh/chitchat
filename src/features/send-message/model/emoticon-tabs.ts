import { isSnowflake, type EmoticonPackId } from "@/shared/lib";
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

/**
 * REQUIREMENTS.md § 13.6. 미니's own 최근 사용, which is the same stored id list read
 * through the other kind.
 *
 * WARN: A **third** value under `ACTIVE_TAB_KEY` and deliberately not a second storage
 * key. `useEmoticonPreload` reads that key and branches on `isPackTabId`, so a value
 * that is neither a pack nor `RECENTS_TAB` falls through to the recents branch it
 * already has — which warms the one id list both menus draw from. A key of its own
 * would have needed that hook changed to know the menu even exists.
 */
export const MINI_RECENTS_TAB = "recents:mini";

// INFO: § 13.8. Where a tap on the composer's underlined word lands, and the one menu reachable without the panel already being open. Never remembered.
export const SEARCH_TAB = "search";

export const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

/** REQUIREMENTS.md § 13.6. Whether this tab is one of the two 최근 사용 tabs rather than a pack. */
export function isRecentsTabId(id: string): boolean {
  return id === RECENTS_TAB || id === MINI_RECENTS_TAB;
}

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
export function isPackTabId(id: string): id is EmoticonPackId {
  return isSnowflake(id);
}
