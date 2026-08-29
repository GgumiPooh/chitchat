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
 * REQUIREMENTS.md § 13.6. 미니's own 최근 사용, holding its own stored ids
 * (`useRecentEmoticons`) so a run of minis cannot evict the other kind's list.
 *
 * WARN: A **third** value under `ACTIVE_TAB_KEY` and deliberately not a tab key of its
 * own. `useEmoticonPreload` reads that key and branches on `isPackTabId`, so a value
 * that is neither a pack nor `RECENTS_TAB` falls through to the recents branch it
 * already has — which this value then tells apart from the other kind's.
 */
export const MINI_RECENTS_TAB = "recents:mini";

// INFO: § 13.6. The 전체 tab of each menu — every enabled pack of that kind, sectioned, fetched pack by pack as the reader scrolls. Two more non-pack values under `ACTIVE_TAB_KEY`, on `MINI_RECENTS_TAB`'s terms.
export const ALL_TAB = "all";

export const MINI_ALL_TAB = "all:mini";

// INFO: § 13.8. Where a tap on the composer's underlined word lands, and the one menu reachable without the panel already being open. Never remembered.
export const SEARCH_TAB = "search";

export const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

/**
 * REQUIREMENTS.md § 13.6. The panel's first region: which of the three menus is on
 * screen, and therefore what the two below it hold.
 *
 * INFO: 검색 first because § 13.8.'s tap arrives there and the leading position is where the thumb starts, then the two kinds in the order a library grows them.
 * WARN: § 8.14. The order is also the menu shortcuts', so their digits are this array's index and never a table of their own.
 */
export const EMOTICON_MENUS = ["search", "emoticon", "mini"] as const;

export type EmoticonMenu = (typeof EMOTICON_MENUS)[number];

// INFO: § 13.6. The menu bar's own labels. 이모티콘 and 미니 are the words § 13.5.'s screens use for the two kinds.
export const MENU_LABELS: Record<EmoticonMenu, string> = {
  search: "검색",
  emoticon: "이모티콘",
  mini: "미니",
};

/** REQUIREMENTS.md § 13.6. Whether this tab is one of the two 최근 사용 tabs rather than a pack. */
export function isRecentsTabId(id: string): boolean {
  return id === RECENTS_TAB || id === MINI_RECENTS_TAB;
}

/** REQUIREMENTS.md § 13.6. Whether this tab is one of the two 전체 tabs. */
export function isAllTabId(id: string): boolean {
  return id === ALL_TAB || id === MINI_ALL_TAB;
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
