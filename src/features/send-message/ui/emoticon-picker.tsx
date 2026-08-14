"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import { MAX_KEYWORD_QUERY_LENGTH, toEmoticonAssetUrl } from "@/shared/config";
import {
  A_SECOND,
  cn,
  isBareKey,
  isCommandKey,
  isShiftKey,
  type EmoticonItemId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { EmptyState, HapticTarget, Input, PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, Smile } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type PropsWithChildren,
  type Ref,
  type RefObject,
} from "react";
import { useStorageState } from "synced-storage/react";
import {
  EMOTICON_GRID_COLUMNS,
  FOCUS_INDEX_ATTRIBUTE,
  focusItem,
  readFocusIndex,
  revealWithin,
  toCrossingIndex,
  toNextFocusIndex,
} from "../model/emoticon-focus";
import { ACTIVE_TAB_KEY, RECENTS_TAB, SEARCH_TAB, isPackTabId } from "../model/emoticon-tabs";
import { toEmoticonsByIdsQuery } from "../model/emoticons-query";
import { toEmoticonPackItemsQuery } from "../model/pack-items-query";
import { toEmoticonPacksQuery } from "../model/packs-query";
import { useEmoticonSearch } from "../model/use-emoticon-search";
import { useHorizontalSwipe, type SwipeDirection } from "../model/use-horizontal-swipe";
import { useRecentEmoticons } from "../model/use-recent-emoticons";

// INFO: REQUIREMENTS.md § 13.6. Two taps on the same cell inside this window are the shortcut past the preview.
const DOUBLE_TAP_WINDOW = A_SECOND / 3;

// WARN: Hoisted so the pending query answers the same array every render — an inline `= []` mints a new identity, and the effect keyed on `packs` then re-runs its two `getBoundingClientRect` reads on every frame of the § 13.6. open animation.
const NO_PACKS: EmoticonPackSummary[] = [];

// WARN: Hoisted for `NO_PACKS`' reason — three queries below fall back to it, and an inline `= []` would hand a fresh identity to every render of the grid and of § 13.8.'s row.
const NO_ITEMS: Emoticon[] = [];

// INFO: § 13.9.1. One sentence for the two places a failed search is said — an empty pane, and the caption under a § 13.9. row that holds the tapped item and nothing the words found.
const SEARCH_FAILED_MESSAGE = "검색하지 못했어요";

/** REQUIREMENTS.md § 8.14. A tab, the cell focus is to land on in it, and the offset to read it at. */
type TabEntry = {
  /**
   * The tab this entry belongs to, where it belongs to one.
   *
   * WARN: § 8.14. Absent for `⌘E`, which asks for **the panel** rather than a tab —
   * and on a freshly loaded page the tab underneath it is still settling, since the
   * remembered pack id is only checked against the list once that list lands (see
   * `activeTab`). Named there, the entry was dropped by that resolution and the panel
   * opened with focus nowhere, which is the whole of this shortcut being dead until a
   * reload put the answer in cache. A page turn does name its tab, and must.
   */
  tab?: string;
  /** Clamped to the list on arrival, since the pack turned to may be shorter than the one turned from. */
  index: number;
  /**
   * The offset the previous tab was read at, restored before the focus lands.
   *
   * WARN: § 8.14. Restored by hand rather than left to the scroller, which keeps its
   * own offset only while it has something to hold it up: a cold pack draws nothing
   * for a round trip (§ 13.6.), and the browser clamps the offset to a content height
   * that is briefly zero. Absent for the entries that arrive from below, which are
   * about to be scrolled to the end anyway.
   */
  scrollTop?: number;
};

/**
 * REQUIREMENTS.md § 8.14. The focus ring, on plain `:focus`, for as long as this panel
 * is being driven by the keyboard.
 *
 * WARN: DESIGN.md § 3.2. says `:focus-visible` and never `:focus`, and this is the
 * third recorded exception rather than a permission. `:focus-visible` is decided by a
 * heuristic this panel breaks: a click focuses a cell **without** it, and a programmatic
 * `focus()` — which is every arrow key here — is judged by whether the *previously*
 * focused element had it. So one click made every later arrow move invisible, with the
 * navigation itself still working, which is worse than no ring at all.
 *
 * WARN: The classes are written out twice rather than composed, because Tailwind reads
 * literals — a variant prefixed at runtime is a class that was never generated.
 */
const CELL_KEYBOARD_RING =
  "focus:bg-primary-tint focus:ring-2 focus:ring-primary focus:ring-inset focus:outline-none";

/** REQUIREMENTS.md § 8.14. `CELL_KEYBOARD_RING` for the tabs, which carry no fill of their own — the selected one already has `bg-primary-tint`. */
const TAB_KEYBOARD_RING = "focus:ring-2 focus:ring-primary focus:outline-none";

/**
 * REQUIREMENTS.md § 8.14. A request to put focus inside the panel, and whether the
 * hand that made it was on the keyboard.
 */
export type EmoticonFocusRequest = {
  /** Bumped per request; `0` asks for nothing. */
  token: number;
  /** Whether the focus rings should be painted on arrival — see `EmoticonPickerProps.focusRequest`. */
  viaKeyboard: boolean;
};

// INFO: A module constant so the default prop is one identity rather than a fresh object per render, which the focus effect below is keyed on.
const NO_FOCUS_REQUEST: EmoticonFocusRequest = { token: 0, viaKeyboard: false };

export type EmoticonPickerProps = {
  className?: string;
  /**
   * REQUIREMENTS.md § 13.6. Whether the strip clipping this panel is open. The panel
   * outlives every close, so it cannot read its own visibility — and § 13.8.'s field
   * takes the keyboard the moment it is on screen, which is a thing a closed panel
   * must never do.
   */
  isOpen: boolean;
  /**
   * REQUIREMENTS.md § 8.14. Bumped by whatever opened this panel, to put focus inside
   * it — a panel nothing has focused is one the arrows cannot reach, whichever way it
   * was opened. A `token` of `0` is the resting value and asks for nothing.
   *
   * WARN: **Every** open bumps it, not only `⌘E`. The toggle is a `button`, so a mouse open leaves focus on the composer's own control and the whole panel is unreachable from the keyboard until the user finds their way back in with `Tab` — which is the bug this shape exists to answer, and the reason `viaKeyboard` rides along rather than being assumed.
   * INFO: `viaKeyboard` decides the **ring** and nothing else (`isKeyboardDriven`). A pointer open focuses a cell silently: `:focus-visible` would not have painted for that user anyway, and a grid lit up by a mouse click is noise. The first key pressed inside the panel turns the rings on through `noteKeyboardUse`.
   */
  focusRequest?: EmoticonFocusRequest;
  /**
   * REQUIREMENTS.md § 13.8. A word tapped in the composer, which opens the search
   * tab with the field already holding it.
   *
   * WARN: Carries a token because tapping the same word twice is two requests, and
   * keyed on the string alone the second one is no change for the effect to see.
   */
  searchRequest?: Nullable<{ query: string; token: number }>;
  /**
   * REQUIREMENTS.md § 13.9. An emoticon tapped in the conversation, which opens
   * § 13.8.'s search on the emoticons related to it — its own keywords in the field,
   * itself at the head of the row, and its pack behind whatever the words found.
   *
   * WARN: The search tab whether or not its pack draws one of its own. A pack tab is
   * the one place that cannot answer this, since it holds that pack and nothing else
   * however far the words would have reached.
   *
   * WARN: Carries a token for `searchRequest`'s reason — tapping the same emoticon
   * twice is two requests, and keyed on the item alone the second one is no change.
   */
  revealRequest?: Nullable<{ emoticon: Emoticon; token: number }>;
  /** REQUIREMENTS.md § 13.8. Whether the search tab is the one on screen — the room exempts it from § 13.6.'s keyboard gate. */
  onSearchTabChange?: (isOnSearchTab: boolean) => void;
  onSelect: (emoticon: Emoticon) => void;
  onQuickSend: (emoticon: Emoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.6. The panel behind the composer's emoticon toggle: bottom
 * tabs are the enabled packs in this user's order (§ 13.1.), selecting an emoticon
 * stages it as a preview, and tapping it twice sends it outright.
 *
 * INFO: DESIGN.md § 9. leaves the panel's exact geometry open, so the height lives
 * in `--emoticon-panel-height` (`theme.css`) — the chat room animates the strip
 * open against the same value, and the two cannot drift apart.
 */
export function EmoticonPicker({
  className,
  isOpen,
  focusRequest = NO_FOCUS_REQUEST,
  searchRequest,
  revealRequest,
  onSearchTabChange,
  onSelect,
  onQuickSend,
}: EmoticonPickerProps) {
  // WARN: Read straight from storage rather than seeded into `useState` — the panel can mount during hydration, where the first snapshot is still the fallback and a seeded state would never pick the stored tab up.
  const [storedTab, setRequestedTab] = useStorageState<string>(ACTIVE_TAB_KEY, RECENTS_TAB, {
    strategy: "localStorage",
  });
  // INFO: § 13.8. The search tab is reached by a tap in the composer rather than chosen, so it stands beside the remembered tab instead of replacing it — the panel reopens on the pack the user last picked, not on a search they have since finished.
  const [forcedTab, setForcedTab] = useState<Nullable<string>>(null);
  const [query, setQuery] = useState("");
  // WARN: State and not a ref, though it is only ever compared. The adjustment below runs during render, where a ref may not be read at all — this is React's own "adjusting state when a prop changes", and the previous token has to be readable there.
  // WARN: Seeded `undefined`, never from `searchRequest`. The panel does not exist until the tap that asks for it, so it mounts with the request already in hand — seeding from it marks that request as applied before anything applies it, and the tap opens the panel on the remembered pack with an empty field. That was the bug, and it is invisible on every later tap because by then the component is mounted.
  const [appliedSearchToken, setAppliedSearchToken] = useState<Optional<number>>(undefined);
  // WARN: § 13.9. Seeded `undefined` for `appliedSearchToken`'s reason — the panel does not exist until the tap that asks for it, so it mounts with the request already in hand.
  const [appliedRevealToken, setAppliedRevealToken] = useState<Optional<number>>(undefined);
  /**
   * INFO: § 13.9. The item 따라하기 named, which is scrolled to, ringed, and put
   * first among search results until the user takes the panel somewhere else.
   *
   * WARN: The whole item and not its id, because the tap holds one the loaded list
   * may not: the other participant can have authored it since this list was fetched,
   * and the panel never unmounts to re-ask. Kept here, the search row can show an
   * emoticon the search itself cannot yet find.
   */
  const [revealed, setRevealed] = useState<Nullable<Emoticon>>(null);
  // INFO: REQUIREMENTS.md § 8.14. The one cell in the tab sequence, which the arrow keys move (ARIA's roving tabindex) — without it a pack of forty is forty tab stops between the composer and the send button.
  // WARN: Declared up here with the tokens rather than beside the other focus state below, because the render-phase adjustments that replace the list all reset it and a `useState` after them is in its own temporal dead zone.
  const [focusedIndex, setFocusedIndex] = useState(0);
  // WARN: State and not a ref, for `appliedSearchToken`'s reason — the reset below runs during render, where a ref may not be read at all.
  const [focusedTab, setFocusedTab] = useState<Nullable<string>>(null);
  // INFO: REQUIREMENTS.md § 8.14. Whether § 13.8.'s field may take the keyboard as its tab arrives. False only for a walk along the strip, which that focus would end.
  const [fieldClaimsFocus, setFieldClaimsFocus] = useState(true);
  // INFO: REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what paints `CELL_KEYBOARD_RING`. A pointer press anywhere in it ends that, and the next key begins it again.
  const [isKeyboardDriven, setIsKeyboardDriven] = useState(false);

  // WARN: § 13.8. Adjusted during render rather than in an effect. An effect lands a frame later, so the panel would open on the remembered tab, paint a grid of the wrong pack, and only then swap to the search row — which reads as the wrong panel flashing up. It is also why the forced tab is component state rather than the stored one: writing `localStorage` during a render is a side effect, and comparing tokens is not.
  if (searchRequest && searchRequest.token !== appliedSearchToken) {
    setAppliedSearchToken(searchRequest.token);
    setQuery(searchRequest.query);
    setForcedTab(SEARCH_TAB);
    // WARN: § 13.9. A word tapped in the composer ends any standing 따라하기, as `selectTab` and typing do. The panel can be open on a revealed cell when that tap lands — left standing, the search pins and rings an emoticon its own query never matched, and `hasReveal` withholds the keyboard from a tap that is a request to type.
    setRevealed(null);
    // WARN: § 8.14. The row is about to be a different list, and the tab has not changed — so the reset keyed on the tab does not fire here. Left alone the one `tabIndex={0}` cell is wherever the previous search's stop was, which `SearchPane` has just scrolled off the right edge.
    setFocusedIndex(0);
    // INFO: § 8.14. This route is always a request to type — ⌘E, or a tap on the underlined word — so the field takes the keyboard however the previous arrival on this tab left the flag.
    setFieldClaimsFocus(true);
  }

  /**
   * WARN: The release, and it is not optional. `chat-room.tsx` gates the panel's
   * existence on a one-way `hasOpenedEmoticonPanel`, so this component never
   * unmounts — without a reset the forced tab outlives the search forever. Two
   * things broke: the toggle reopened onto a finished search instead of the
   * remembered pack, and `onSearchTabChange(true)` stayed latched, which took
   * § 13.6.'s `!isKeyboardOpen` gate out of the room's condition permanently —
   * including for the Android case that gate is derived rather than an effect for.
   */
  if (!searchRequest && appliedSearchToken !== undefined) {
    setAppliedSearchToken(undefined);
    setQuery("");
    // WARN: § 13.9. The search tab and nothing else. A 따라하기 lands on a pack tab and reports itself off the search tab in the same commit, which is what withdraws the room's request — clearing unconditionally here would take the panel straight back off the tab that tap just asked for.
    setForcedTab((current) => (current === SEARCH_TAB ? null : current));
  }

  // WARN: § 13.8. The second release, and the one above cannot stand in for it. `selectTab` also forces 검색 with no request behind it — a tap on the tab, or a swipe from 최근 사용 — so `appliedSearchToken` is never set and that branch never fires: the forced tab outlived every close, the toggle reopened onto a finished search, and `onSearchTabChange(true)` stayed latched for the rest of the session with § 13.6.'s keyboard gate out of the room's condition behind it.
  // INFO: § 13.9. The reveal is released the same way and at the same moment, so a panel reopened by the toggle draws the remembered tab rather than the ring left over from a 따라하기.
  // WARN: § 13.9. `!revealRequest` is as load-bearing as `!searchRequest` beside it. A tap made while the keyboard is up opens nothing for the length of its retraction (§ 13.6.), so the reveal is applied over several renders where `isOpen` is still false — released on those, the panel finishes opening on the remembered tab and the tap reads as having done nothing.
  if (!isOpen && !searchRequest && !revealRequest && (forcedTab !== null || revealed !== null)) {
    setQuery("");
    setForcedTab(null);
    setRevealed(null);
  }

  const requestedTab = forcedTab ?? (typeof storedTab === "string" ? storedTab : RECENTS_TAB);
  const tabStripRef = useRef<Nullable<HTMLDivElement>>(null);
  const activeTabRef = useRef<Nullable<HTMLSpanElement>>(null);
  // INFO: § 8.14. Whichever scroller currently holds the cells — the grid, or § 13.8.'s results row. One ref because the two are branches of the same ternary and never coexist.
  const cellScrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const searchFieldRef = useRef<Nullable<HTMLInputElement>>(null);
  // INFO: § 8.14. The last `focusRequest` that has been turned into a `pendingEntryRef`, so one already acted on is told apart from a new one.
  const satisfiedFocusRequestRef = useRef(0);
  /**
   * REQUIREMENTS.md § 8.14. Where focus is to land once the tab it names has cells to
   * land on, and the offset that tab is to be read at.
   *
   * WARN: A request that outlives the render that made it, because a pack is a round
   * trip from being drawn (§ 13.6.) — and it names its tab, so one still waiting when
   * the user has moved on is dropped rather than taking focus on a tab they did not
   * ask for.
   */
  const pendingEntryRef = useRef<Nullable<TabEntry>>(null);
  const [slideFrom, setSlideFrom] = useState<SwipeDirection>(1);
  const lastTapRef = useRef<Nullable<{ at: number; id: EmoticonItemId }>>(null);
  const swipeHandlers = useHorizontalSwipe(goToAdjacentTab);
  // WARN: § 13.6. Read only. `remember` belongs to the send, not to the tap — recording it here re-sorts 최근 사용 between the two taps of a double tap, moving the cell out from under the second one.
  const { recentIds } = useRecentEmoticons();
  // INFO: § 13.6. The same descriptor `useEmoticonPreload` warmed, so the panel opens on the cached list rather than on `isPending`.
  // WARN: § 13.8. Every pack, hidden ones included, and summaries only. The hidden ones are here because § 13.9.'s 따라하기 needs to name a pack this user has taken out of the strip; what makes such a pack's emoticons *findable* is that the server's search applies no `enabled` filter either.
  const { data: packs = NO_PACKS, isPending } = useQuery(toEmoticonPacksQuery());
  const visiblePacks = packs.filter((pack) => pack.isEnabled);

  /**
   * WARN: § 13.9. Applied during render, for the reason `searchRequest` is: an
   * effect lands a frame later, so the panel would open on the remembered tab, paint
   * the wrong grid, and only then move — which reads as the wrong panel flashing up.
   *
   * INFO: § 13.9. Always the search tab, whether or not the item's own pack draws
   * one. What the tap asks for is the emoticons *related* to this one, and a pack
   * tab is the one place that cannot show them — it holds this item's pack and
   * nothing else, however the words would have widened it.
   */
  if (revealRequest && revealRequest.token !== appliedRevealToken) {
    setAppliedRevealToken(revealRequest.token);
    setRevealed(revealRequest.emoticon);
    setForcedTab(SEARCH_TAB);
    setQuery(revealRequest.emoticon.keywords.join(", "));
    // WARN: § 8.14. As the search request above resets it, and here the head of the row is the tapped item itself — a stop left mid-row is the one cell 따라하기 exists to put first not being the one a `Tab` reaches.
    setFocusedIndex(0);
  }

  const revealedId = revealed?.id ?? null;

  // INFO: The remembered pack can be gone or hidden (§ 13.1.) by the time the panel reopens, so it only holds while the loaded list still has it.
  // WARN: `isPackTabId` gates the pending branch, and it is the only thing that does. The stored tab is an unvalidated `localStorage` string, and while the list is in flight this expression is what hands it to `fetchPackItems` as a path segment.
  const activeTab =
    requestedTab === RECENTS_TAB ||
    requestedTab === SEARCH_TAB ||
    (isPackTabId(requestedTab) && (isPending || findPack(visiblePacks, requestedTab)))
      ? requestedTab
      : RECENTS_TAB;
  const isSearching = activeTab === SEARCH_TAB;
  // WARN: § 13.9.1. The results are the server's, ranked there — this component may filter the revealed item out of them but must never re-sort them.
  const {
    results: searchResults,
    isPending: isSearchPending,
    hasFailed: hasSearchFailed,
    // WARN: § 13.9. The reveal is handed over so the hook can drop the previous query's answer for it — a 따라하기 is a jump to an unrelated query, not a keystroke, and the row it lands in frames whatever is behind the tapped item as related to it.
  } = useEmoticonSearch(query, isSearching, revealed !== null);
  // INFO: § 13.6. The open tab's own items, which is what the summaries above no longer carry. 최근 사용 and 검색 are not packs and ask for nothing.
  const activePackId = isPackTabId(activeTab) && !isSearching ? activeTab : null;
  const {
    data: activePackItems = NO_ITEMS,
    isPending: isPackPending,
    isError: hasPackFailed,
  } = useQuery(toEmoticonPackItemsQuery(activePackId));
  /**
   * WARN: § 13.9. Computed out here and not inside `toShownItems`, because the
   * fallback it feeds is a query and a hook cannot be called from there.
   *
   * WARN: The condition MUST stay identical to the one `toShownItems` applies. Asked
   * for eagerly it is a request per 따라하기 that almost every one of them throws
   * away; asked for on a wider condition than the row's, the pack arrives for a case
   * the row does not use it in.
   */
  const revealedRelated =
    isSearching && revealed ? searchResults.filter((item) => item.id !== revealed.id) : NO_ITEMS;
  // WARN: § 13.9.1. `!hasSearchFailed` is as load-bearing as `!isSearchPending` beside it. A failure unlatches pending, so without it the pack shelf arrived on the error path — silently, since a non-empty row never reaches `toEmptyMessage` — and the fallback asserted "these are related" for a question nothing had answered.
  const fallbackPackId =
    isSearching && revealed && revealedRelated.length === 0 && !isSearchPending && !hasSearchFailed
      ? revealed.packId
      : null;
  const { data: fallbackPackItems = NO_ITEMS } = useQuery(toEmoticonPackItemsQuery(fallbackPackId));
  // INFO: § 13.6. 최근 사용 stores ids alone, so the items behind them are resolved here rather than found in a list the panel no longer holds.
  const {
    data: recentItems = NO_ITEMS,
    isPending: isRecentsQueryPending,
    isError: hasRecentsFailed,
  } = useQuery(toEmoticonsByIdsQuery(recentIds));
  // WARN: § 13.6. `skipToken` leaves a query pending for as long as it is skipped, so an empty 최근 사용 — which has nothing to ask — must not be read as an answer still in flight, or its tab would never draw its own placeholder.
  const isRecentsPending = recentIds.length > 0 && isRecentsQueryPending;

  const byId = new Map(recentItems.map((item) => [item.id, item] as const));
  // INFO: § 13.1. 최근 사용 is a tab like any other, so hiding a pack takes its items out of this list too — an emoticon sent through § 13.9. from a hidden pack is remembered and simply not drawn here.
  const visiblePackIds = new Set(visiblePacks.map((pack) => pack.id));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((item): item is Emoticon => item !== undefined && visiblePackIds.has(item.packId));
  const shown = toShownItems();
  const tabIds = [SEARCH_TAB, RECENTS_TAB, ...visiblePacks.map((pack) => pack.id)];
  const activeIndex = tabIds.indexOf(activeTab);

  // WARN: § 8.14. Adjusted during render rather than in an effect. The tab's own cells render in this same commit, so a stop reset a frame later is one frame in which `tabIndex={0}` sits on a cell of the pack that just left.
  if (focusedTab !== activeTab) {
    setFocusedTab(activeTab);
    setFocusedIndex(0);
  }

  // WARN: § 8.14. Clamped rather than reset by every change to the list. A search narrows its results on each keystroke while focus stays in the field, and a stop past the end would leave the row with no tab stop at all.
  const focusableIndex = Math.min(focusedIndex, shown.length - 1);
  /**
   * INFO: § 8.14. The strip's stop is simply the open tab, because the arrows there
   * activate what they land on — focus and selection cannot come apart.
   *
   * WARN: With a fallback to the first tab. `activeTab` is allowed to hold a stored
   * pack id the list has not answered for yet (see above), and that id is in no
   * `tabIds` — left alone, the strip carries no tab stop at all for the length of that
   * request, which is also exactly when the grid has no cell to carry one either.
   */
  const focusableTabId = tabIds.includes(activeTab) ? activeTab : tabIds[0];

  // INFO: § 13.6. The swipe moves the tab without the finger ever touching the strip, and the remembered tab can reopen the panel on a pack that is already past its right edge — either way the strip has to follow the selection or the active tab is unreachable to the eye.
  useEffect(revealActiveTab, [activeTab, packs]);

  /**
   * REQUIREMENTS.md § 8.14. Focus into the panel when `⌘E` opened it, since a key that
   * opens a panel and leaves focus behind has opened one the arrows cannot reach.
   *
   * WARN: Keyed on the item count as well, because a cold pack is a round trip from
   * having a cell to focus (§ 13.6.). The request is only marked as satisfied once
   * something actually took the focus, so it survives that wait — and it is dropped
   * when the panel is not open, or a pack landing after the panel closed would pull
   * the caret back out of the field.
   */
  useLayoutEffect(() => {
    if (focusRequest.token !== 0 && focusRequest.token !== satisfiedFocusRequestRef.current) {
      satisfiedFocusRequestRef.current = focusRequest.token;
      pendingEntryRef.current = { index: 0 };
      // WARN: § 8.14. `noteKeyboardUse` cannot hear the key that opened the panel — ⌘E is pressed with focus outside it, so the event never travels through it. Left unsaid, the cell this is about to focus paints no ring: `:focus-visible` judges a programmatic focus by whether the *previously* focused element had it, and on a freshly loaded page that is `<body>`, which never does. Reaching the panel from the composer hid it, a text field always matching.
      // WARN: § 8.14. And it is set from the request rather than to `true`, because a pointer open makes one of these too now. The panel outlives every close, so a stale `true` from an earlier ⌘E would light the whole grid up for a mouse the moment it reopened.
      setIsKeyboardDriven(focusRequest.viaKeyboard);
    }

    const entry = pendingEntryRef.current;

    if (!entry) {
      return;
    }

    // WARN: § 8.14. Dropped on a tab that is no longer the one asked for, and on a closed panel — reaching for the composer closes it (§ 13.6.), and a pack landing after that would pull the caret back out of the field.
    if (!isOpen || (entry.tab !== undefined && entry.tab !== activeTab)) {
      pendingEntryRef.current = null;

      return;
    }

    if (enterTab(entry)) {
      pendingEntryRef.current = null;
    }
    // WARN: `enterTab` is deliberately not a dependency. It closes over this render's tab and list, which is exactly what the deps below already state — listed, it would re-run the focus on every render of an open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, focusRequest.token, isOpen, shown.length]);

  // WARN: § 13.8. The room exempts this tab from § 13.6.'s keyboard gate, so it has to be told on every change — reported off the tab rather than off the field's focus, or the frame between a blur and the keyboard actually retracting closes the panel underneath the user.
  useEffect(() => {
    onSearchTabChange?.(isSearching);
  }, [isSearching, onSearchTabChange]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col rounded-lg border border-hairline bg-canvas",
        // INFO: § 13.8. The search tab is the one tab that may share the screen with the keyboard, so it is drawn at a height that fits in what the keyboard leaves.
        // WARN: The same 200ms `ease-out` the § 13.6. clipping strip animates its own height with, and the two MUST stay identical. Left instant here the asymmetry was visible only one way: growing, the taller panel is clipped by the strip and revealed as it opens, so it reads as smooth — shrinking, the panel collapses in one frame inside a strip that is still catching up.
        "transition-[height] duration-200 ease-out",
        isSearching ? "h-(--emoticon-search-panel-height)" : "h-(--emoticon-panel-height)",
        className,
      )}
      onKeyDown={handlePanelKeys}
      // WARN: § 8.14. Capture, because the results row stops `pointerdown` propagating while it still has somewhere to scroll (`keepAxisWhileScrollable`) — bubbled, the one scroller a drag most often starts in would never report the pointer taking over.
      onPointerDownCapture={() => setIsKeyboardDriven(false)}
    >
      {isSearching ? (
        <SearchPane
          isOpen={isOpen}
          query={query}
          results={shown}
          isPending={isSearchPending}
          hasFailed={hasSearchFailed}
          revealedId={revealedId}
          revealToken={appliedRevealToken}
          takesFocus={fieldClaimsFocus}
          focusableIndex={focusableIndex}
          isKeyboardDriven={isKeyboardDriven}
          fieldRef={searchFieldRef}
          rowRef={cellScrollerRef}
          onQueryChange={changeQuery}
          onSelect={handleSelect}
          onFieldKeys={handleFieldKeys}
          onCellKeys={handleCellKeys}
          onCellFocus={trackCellFocus}
          onSwipe={goToAdjacentTab}
        />
      ) : (
        // WARN: `overflow-x-hidden` is what keeps the § 13.6. slide inside the panel — a vertical-only scroller still resolves its horizontal axis to `auto`.
        // WARN: `touch-pan-y` leaves the vertical scroll native while denying the browser the horizontal axis, which it would otherwise consume before the § 13.6. swipe ever sees it.
        <div
          ref={cellScrollerRef}
          className="scrollbar-hidden min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-xs"
          onKeyDown={handleCellKeys}
          onFocus={trackCellFocus}
          {...swipeHandlers}
        >
          {/* WARN: § 13.6. The tab's own items are a request now, so the grid waits for them as it waits for the list. Drawn before they land, a pack tab paints `이 그룹에는 이모티콘이 없어요` over a pack that has plenty — the verdict-before-the-answer § 13.9.1. removed from the search pane. */}
          {/* WARN: § 13.6. 최근 사용 is the default tab and its ids resolve through a request of their own, so it needs the same guard — without it the panel flashes `최근 사용한 이모티콘이 여기에 보여요` every time it opens ahead of the preload. Every send used to do it too, a new id being a cold key; `emoticons-query.ts` holds the previous answer over for exactly that. */}
          {/* INFO: § 13.6. A pack tab holds nothing over, deliberately, where 최근 사용 does. The key there is the same list plus one item; here it is a **different pack**, and what would slide in under the new tab is another pack's shelf, swapped out a round trip later. */}
          {/* INFO: § 13.6. So the animation below decorates the arrival rather than the gesture — a warm tab slides at once, a cold one is blank for a round trip and slides after. Recorded and not fixed: waiting is still better than painting `이 그룹에는 이모티콘이 없어요` over a pack that is full. */}
          {isPending ||
          (activePackId !== null && isPackPending) ||
          (activeTab === RECENTS_TAB && isRecentsPending) ? null : (
            // WARN: Keyed by the tab so each pack mounts fresh — an enter animation on an updated subtree never replays.
            <div
              key={activeTab}
              className={cn(
                "animate-in duration-200",
                slideFrom === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6",
              )}
            >
              {shown.length === 0 ? (
                <EmptyState
                  className="border-0 bg-transparent"
                  Icon={Smile}
                  description={toGridEmptyMessage()}
                />
              ) : (
                // INFO: DESIGN.md § 9. Assets are user-authored, so their aspect ratios are arbitrary — the cell is a fixed square and the still is `object-contain` inside it.
                // WARN: § 8.14. The column count is `EMOTICON_GRID_COLUMNS` as well as this class, and the two MUST agree — the vertical arrows step by that number, and a grid drawn at a different width moves focus to the wrong row.
                // INFO: § 8.14. `group` and not `grid`. ARIA's grid role requires `row` elements this layout has nowhere to put — a `display: contents` wrapper is the only place, and that is the property browsers spent years dropping from the accessibility tree. The **keys** follow the grid pattern; the roles say what is true, which is a labelled group of buttons.
                <div className="grid grid-cols-4 gap-2xs" role="group" aria-label="이모티콘">
                  {shown.map((item, index) => (
                    <EmoticonCell
                      key={item.id}
                      className="flex"
                      buttonClassName="aspect-square w-full"
                      item={item}
                      index={index}
                      isFocusable={index === focusableIndex}
                      isKeyboardDriven={isKeyboardDriven}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* INFO: § 13.6. Pack tabs along the bottom, matching where the thumb already is. */}
      {/* WARN: The horizontal inset is the first and last tab's margin, never the strip's `padding-inline`. WebKit reports `scrollWidth === clientWidth` until the content already overflows *without* `padding-right`, so a strip padded that way has a dead band the width of that padding where it is over-full and cannot be scrolled at all. */}
      {/* INFO: REQUIREMENTS.md § 8.14. ARIA's toolbar: one tab stop for the whole strip, and the bare arrows walking it — which open what they land on, exactly as § 13.6.'s swipe does. */}
      <div
        ref={tabStripRef}
        className="scrollbar-hidden flex shrink-0 gap-2xs overflow-x-auto border-t border-hairline-soft py-2xs [&>*:first-child]:ml-2xs [&>*:last-child]:mr-2xs"
        role="toolbar"
        aria-label="이모티콘 묶음"
        onKeyDown={handleTabStripKeys}
      >
        {/* INFO: § 13.8. First, so a swipe left from 최근 사용 reaches it and the tap target sits where the thumb starts. */}
        <TabButton
          ref={isSearching ? activeTabRef : undefined}
          index={0}
          isActive={isSearching}
          isFocusable={focusableTabId === SEARCH_TAB}
          isKeyboardDriven={isKeyboardDriven}
          label="이모티콘 검색"
          onClick={() => selectTab(SEARCH_TAB)}
        >
          <Search className="size-5 text-meta" strokeWidth={1.75} />
        </TabButton>
        <TabButton
          ref={activeTab === RECENTS_TAB ? activeTabRef : undefined}
          index={1}
          isActive={activeTab === RECENTS_TAB}
          isFocusable={focusableTabId === RECENTS_TAB}
          isKeyboardDriven={isKeyboardDriven}
          label="최근 사용"
          onClick={() => selectTab(RECENTS_TAB)}
        >
          <Clock className="size-5 text-meta" strokeWidth={1.75} />
        </TabButton>
        {/* WARN: § 13.1. `visiblePacks` and never `packs` — the list carries hidden packs so § 13.8. can search them, and a hidden pack drawn here is a tab `activeTab` resolves away from, so the tap does nothing but overwrite the remembered pack with an id that can never be restored. */}
        {visiblePacks.map((pack, index) => (
          <TabButton
            key={pack.id}
            ref={activeTab === pack.id ? activeTabRef : undefined}
            // WARN: § 8.14. Offset past 검색 and 최근 사용, so it indexes `tabIds` — the array `goToAdjacentTab` and the strip's own arrows both step through.
            index={index + 2}
            isActive={activeTab === pack.id}
            isFocusable={focusableTabId === pack.id}
            isKeyboardDriven={isKeyboardDriven}
            label={pack.name}
            onClick={() => selectTab(pack.id)}
          >
            {/* INFO: § 13.2. Already the item the pack is drawn with — the server resolves the fallback now, since this strip holds no items to look through. */}
            {pack.thumbnailItemId ? (
              <PreloadImage
                className="size-full"
                imgClassName="size-full object-contain"
                placeholderClassName="rounded-sm"
                alt=""
                // WARN: § 13.3. Each of these is a session check, a row read and a presign, and the strip scrolls — without this every pack in the library spends one on the frame the panel first opens.
                loading="lazy"
                src={toEmoticonAssetUrl(
                  pack.thumbnailItemId,
                  "still-image",
                  pack.thumbnailVersion ?? undefined,
                )}
              />
            ) : (
              <Smile className="size-5 text-meta" strokeWidth={1.75} />
            )}
          </TabButton>
        ))}
      </div>
    </div>
  );

  /**
   * INFO: § 13.8. The search tab looks across every pack at once, hidden ones
   * included — a word is a property of the item, and which pack it happens to sit in,
   * or whether that pack draws a tab, is not what the user is answering.
   */
  function toShownItems(): Emoticon[] {
    if (isSearching) {
      if (!revealed) {
        return searchResults;
      }

      /**
       * INFO: § 13.9. The tapped item first, then everything its words reached, best
       * first.
       *
       * WARN: Its own pack is the fallback and **only** the fallback. Appended to
       * every answer it buried the cross-pack matches under one pack's shelf, which
       * is what made the feature read as "this set only" — the exact thing the
       * ranking exists to undo. It is still needed, because an item nobody has
       * described answers to nothing and would otherwise stand in the row alone.
       *
       * WARN: `isSearchPending` guards it, and that guard is new with the server
       * search. Reached while the answer is still in flight, every 따라하기 would
       * paint one pack's shelf for a frame and then swap it for the ranked row —
       * which is the "this set only" reading arriving anyway, just briefly.
       *
       * WARN: § 13.9.1. A failed search is not a fallback either, and it reached one
       * by the back door: an error unlatches pending, so the shelf appeared with
       * nothing saying the words had never been answered. `fallbackPackId` withholds
       * the request and `SearchPane` says so under the row instead.
       *
       * WARN: § 13.6. The pack is a request of its own now, so it lands a round trip
       * after the reveal rather than being in hand. The row shows the tapped item
       * alone until it does, which is the honest intermediate state — and it is only
       * honest because the hook drops the previous query's answer for a reveal, which
       * is what used to fill this row with the last search's results.
       */
      const related =
        revealedRelated.length > 0 || isSearchPending ? revealedRelated : fallbackPackItems;

      return [revealed, ...related.filter((item) => item.id !== revealed.id)];
    }

    if (activeTab === RECENTS_TAB) {
      return recents;
    }

    return activePackItems;
  }

  /**
   * INFO: § 13.6. What an empty grid says, which depends on why it is empty.
   *
   * WARN: A failed request is not an empty pack, and saying so was the bug. The items
   * behind both tabs are requests now, and `isPending` goes false on an error as
   * readily as on an answer — so the grid asserted `이 그룹에는 이모티콘이 없어요` over
   * a pack that had plenty and the user had no way to tell.
   */
  function toGridEmptyMessage(): string {
    if (activeTab === RECENTS_TAB) {
      return hasRecentsFailed
        ? "이모티콘을 불러오지 못했어요"
        : "최근 사용한 이모티콘이 여기에 보여요";
    }

    return hasPackFailed ? "이모티콘을 불러오지 못했어요" : "이 그룹에는 이모티콘이 없어요";
  }

  /**
   * INFO: REQUIREMENTS.md § 13.6. The second tap of a double tap sends what the first one staged.
   *
   * WARN: Counted off `click` rather than `dblclick`, which never arrives on touch — `HapticTap` takes the tap on its overlay and replays it as a scripted `control.click()`, and a scripted click starts no double-click sequence.
   */
  function handleSelect(item: Emoticon) {
    const lastTap = lastTapRef.current;
    const now = Date.now();

    if (lastTap?.id === item.id && now - lastTap.at < DOUBLE_TAP_WINDOW) {
      // INFO: Cleared so a third tap opens a fresh pair rather than sending again off the second one.
      lastTapRef.current = null;
      onQuickSend(item);

      return;
    }

    lastTapRef.current = { id: item.id, at: now };
    onSelect(item);
  }

  /**
   * INFO: Scrolled by hand rather than with `scrollIntoView`, which walks every
   * scrollable ancestor — the § 13.6. strip the panel is clipped by is
   * `overflow: hidden`, and mid-collapse that counts as one.
   *
   * INFO: § 8.14. Shares `revealWithin` with the arrow keys, which are written against
   * the same trap. The strip has only a horizontal axis to be clipped on, so the
   * vertical term that call computes resolves to `0` here.
   */
  function revealActiveTab() {
    const strip = tabStripRef.current;
    const tab = activeTabRef.current;

    if (strip && tab) {
      revealWithin(strip, tab, "smooth");
    }
  }

  /**
   * REQUIREMENTS.md § 8.14. What the panel hears from every key pressed anywhere
   * inside it, and the only thing it does with one.
   *
   * INFO: § 8.14. Neither `⌘E` nor `⌘⇧E` is answered here, and both used to be. Both
   * **toggle** now, and what each of them toggles — whether the panel is open, and
   * whether 검색 is the tab on screen — is the room's state, so a copy in here could
   * only ever open and never close.
   */
  function noteKeyboardUse() {
    setIsKeyboardDriven(true);
  }

  /**
   * REQUIREMENTS.md § 8.14. Every key pressed anywhere in the panel passes here: it
   * turns the focus rings on, and it answers `⇧←/→` — the pack turn, from wherever
   * inside the panel the user happens to be standing.
   *
   * INFO: The bare `←`/`→` already turn the pack, but only from the strip or off the end of a row. This is the same journey without having to be at an edge to make it, which is what a strip of forty packs needs.
   * WARN: `Shift` alone, and the modifier is not a free choice: `⌘←/→` is browser Back and Forward on macOS, `⌥←/→` is word-motion and Back/Forward on Windows, `⌃←/→` is Spaces — the same survey § 8.14. ran for the tab switch, with the same one survivor.
   * WARN: Never inside a text field. `Shift` plus an arrow is how every field on every platform extends a selection, and § 13.8.'s query is a field the user is typing into — so the search tab reaches this from its results row rather than from the input, by way of `↓`.
   */
  function handlePanelKeys(event: KeyboardEvent<HTMLDivElement>) {
    noteKeyboardUse();

    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      !isShiftKey(event) ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
      isTextField(event.target)
    ) {
      return;
    }

    event.preventDefault();
    turnPage(event.target, event.key === "ArrowRight" ? 1 : -1);
  }

  /**
   * REQUIREMENTS.md § 8.14. Turns the pack and leaves focus somewhere it can carry on
   * from, which is a different place depending on where the key was pressed.
   *
   * INFO: On a cell it is the ordinary page turn (`crossToAdjacentTab`), so the reader lands on the same row at the opposite edge and neither the eye nor the scroller moves for it. On the strip it walks the strip, exactly as the bare arrows there do. Anywhere else there is nothing focused to preserve, so the tab simply changes.
   */
  function turnPage(target: EventTarget, direction: SwipeDirection) {
    const strip = tabStripRef.current;
    const scroller = cellScrollerRef.current;
    const node = target instanceof Node ? target : null;

    if (strip && node && strip.contains(node)) {
      // WARN: `activeIndex < 0` is the window before the packs land, where the remembered tab is in no list — `goToAdjacentTab` refuses it for that reason, and stepping from `-1` here resolved to `tabIds[0]` and opened 검색, which nothing else arrives at by accident.
      const next = activeIndex < 0 ? -1 : activeIndex + direction;

      if (tabIds[next]) {
        // WARN: § 13.8. `claimsField: false`, as the strip's own arrows pass — a walk that lands on 검색 must not have the field take the keyboard out from under it.
        selectTab(tabIds[next], { claimsField: false });
        focusItem(strip, next);
      }

      return;
    }

    const index = scroller && node && scroller.contains(node) ? readFocusIndex(node) : undefined;

    if (index === undefined) {
      goToAdjacentTab(direction);

      return;
    }

    crossToAdjacentTab(index, direction);
  }

  /**
   * REQUIREMENTS.md § 8.14. Arrow keys over the cells, and the two ways to send one.
   *
   * INFO: Delegated to the scroller rather than bound per cell — `keydown` bubbles,
   * and a grid of forty cells would otherwise mint forty handlers per render.
   */
  function handleCellKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) {
      return;
    }

    const index = readFocusIndex(event.target);

    if (index === undefined) {
      return;
    }

    // WARN: § 8.14. `Space` as well as `Enter`. It activates on `keyup` rather than repeating, so it needs no guard of its own — but left to the native click it reaches `handleSelect` and two presses inside `DOUBLE_TAP_WINDOW` send, which is the pair this route exists to keep out of the keyboard.
    if (event.key === "Enter" || event.key === " ") {
      activateCell(event, shown[index]);

      return;
    }

    // WARN: § 8.14. The bare arrows only, and `isBareKey` rather than `!isCommandKey`. This guard asks "is this somebody else's chord", which is the **negative** of what `isCommandKey` answers — that one is an exact match, so it says no to `⌘⇧↓` and `⌥↓` and would have let both move a cell. ⌘↓ leaves the panel for the live edge, ⌥↓ scrolls the conversation, and `⌘⇧↓` extends a selection: none of them is this scroller's.
    if (!isBareKey(event)) {
      return;
    }

    // INFO: § 13.8. The results row is a single row, so its vertical arrows lead out of it — up to the field that filled it.
    if (isSearching && event.key === "ArrowUp") {
      event.preventDefault();
      searchFieldRef.current?.focus();

      return;
    }

    const next = toNextFocusIndex(event.key, {
      index,
      count: shown.length,
      columns: isSearching ? 1 : EMOTICON_GRID_COLUMNS,
    });

    if (next !== undefined) {
      event.preventDefault();
      focusItem(event.currentTarget, next);

      return;
    }

    // INFO: § 8.14. Down off the end of the list is the way to the tabs, which is what makes the whole panel reachable with the arrows alone — the strip is the last thing on it, and reading the panel downwards is what arrives there.
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusActiveTab();

      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      crossToAdjacentTab(index, event.key === "ArrowRight" ? 1 : -1);
    }
  }

  /**
   * REQUIREMENTS.md § 8.14. `←`/`→` off the end of a row turns the page: the pack
   * beside this one, entered on the **same row at the opposite edge** and read at the
   * same offset, so neither the eye nor the scroller moves for the turn.
   *
   * WARN: § 13.8. Not armed towards 검색, which claims the keyboard for its own field
   * as it mounts — an entry would take that focus back out a moment later.
   */
  function crossToAdjacentTab(index: number, direction: SwipeDirection) {
    const scrollTop = cellScrollerRef.current?.scrollTop;
    const moved = goToAdjacentTab(direction);

    if (moved === undefined || moved === SEARCH_TAB) {
      return;
    }

    pendingEntryRef.current = {
      tab: moved,
      index: toCrossingIndex({
        index,
        count: shown.length,
        columns: isSearching ? 1 : EMOTICON_GRID_COLUMNS,
        direction,
      }),
      scrollTop,
    };
  }

  /**
   * REQUIREMENTS.md § 8.14. `↓` out of § 13.8.'s field and into what it filled — the
   * results row where the words found something, and the tabs where they did not, so
   * the key navigates on an empty search as readily as on a full one.
   *
   * WARN: `isComposing` and the bare key only, through `isBareKey` rather than
   * `!isCommandKey`. A Hangul IME steers its candidate list with this key; ⌘↓ is the
   * room's jump to the live edge; ⌥↓ scrolls the conversation; and `⌘⇧↓` extends the
   * selection this field is holding — which `isCommandKey`, an exact match, says no to,
   * so asking it here would have taken that selection away.
   */
  function handleFieldKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowDown" || !isBareKey(event) || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    const row = cellScrollerRef.current;

    if (!row || !focusItem(row, Math.max(focusableIndex, 0))) {
      focusActiveTab();
    }
  }

  /** REQUIREMENTS.md § 8.14. Into the strip from the list above it. */
  function focusActiveTab() {
    const strip = tabStripRef.current;

    if (strip) {
      focusItem(strip, tabIds.indexOf(focusableTabId));
    }
  }

  /** REQUIREMENTS.md § 8.14. `ArrowUp` off the strip, back into what the tab holds. */
  function focusTabContent() {
    enterTab({ index: 0 });
  }

  /**
   * REQUIREMENTS.md § 8.14. Puts focus where a `TabEntry` asked for it, and reports
   * whether it landed.
   *
   * INFO: § 8.14. The head of the list is where every way *in* lands — the `ArrowUp`
   * off the strip and the `⌘E` that opened the panel both pass `0`. Only a page turn
   * (`crossToAdjacentTab`) names a cell of its own, because that one is continuing a
   * row rather than starting a list.
   *
   * WARN: § 8.14. Clamped, which is what answers a pack shorter than the one turned
   * away from: the row `→` was on may not exist here, so focus takes the nearest cell
   * to it rather than nothing at all.
   */
  function enterTab(entry: TabEntry): boolean {
    const scroller = cellScrollerRef.current;

    if (scroller && shown.length > 0) {
      if (entry.scrollTop !== undefined) {
        scroller.scrollTop = entry.scrollTop;
      }

      return focusItem(scroller, Math.min(entry.index, shown.length - 1));
    }

    searchFieldRef.current?.focus();

    // INFO: § 8.14. A pack tab with nothing drawn yet has nowhere to put focus, and says so — the entry waits for its cells rather than settling for `<body>`.
    return isSearching;
  }

  /**
   * INFO: REQUIREMENTS.md § 8.14. `Enter` is § 13.6.'s tap: once stages a preview, and
   * twice inside `DOUBLE_TAP_WINDOW` sends. `⌘Enter` is the same send in one press,
   * kept because it is what every other app spells it with.
   *
   * WARN: The pair goes through `handleSelect`, so the keyboard and the thumb count
   * against **one** window rather than two — which is what makes the rule one rule.
   *
   * WARN: § 8.14. The repeat guard is what keeps a *held* key out of that pair. The
   * browser fires this per repeat, so without it a key left down stages, sends, and
   * goes on sending at the repeat rate.
   *
   * WARN: The native `click` is prevented, or it would land in `handleSelect` a second
   * time and every single press would read as a pair.
   */
  function activateCell(event: KeyboardEvent<HTMLDivElement>, item: Optional<Emoticon>) {
    event.preventDefault();

    if (event.repeat || !item) {
      return;
    }

    if (isCommandKey(event)) {
      // WARN: § 13.6. The standing pair is cleared, or a press landing after this send would pair with one the send already spent.
      lastTapRef.current = null;
      onQuickSend(item);

      return;
    }

    handleSelect(item);
  }

  // INFO: § 8.14. `onFocus` rather than a handler per cell: React's is `focusin`, which bubbles where the DOM's `focus` does not.
  function trackCellFocus(event: FocusEvent<HTMLDivElement>) {
    const index = readFocusIndex(event.target);

    if (index !== undefined) {
      setFocusedIndex(index);
    }
  }

  /**
   * REQUIREMENTS.md § 8.14. `←`/`→` walk the strip **and** open what they land on,
   * and `↑` goes back into the tab's own list.
   *
   * INFO: Automatic activation, though each tab is a request of its own (§ 13.6.).
   * The swipe already works exactly this way — one fetch per tab crossed — so the
   * keyboard is not paying a cost the pointer avoids, and manual activation cost two
   * keys per pack in the one flow this exists to make mouse-free.
   *
   * WARN: § 8.14. No modifier on these, and that is the whole point. ⌘←/→ was the
   * first binding and it is **browser Back and Forward** on macOS — from anywhere
   * outside this panel it simply left the conversation.
   */
  function handleTabStripKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !isBareKey(event)) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusTabContent();

      return;
    }

    const index = readFocusIndex(event.target);

    if (index === undefined) {
      return;
    }

    const next = toNextFocusIndex(event.key, { index, count: tabIds.length, columns: 1 });

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    // WARN: § 13.8. The tab is opened without letting 검색 claim the keyboard. A walk along the strip is a walk, and a field that grabs focus on arrival ends it — which is exactly what forced a reach for the mouse.
    selectTab(tabIds[next], { claimsField: false });
    focusItem(event.currentTarget, next);
  }

  // INFO: § 13.9. Typing is the user taking the search over, so the item 따라하기 pinned to the front of the row stops being pinned.
  function changeQuery(next: string) {
    setQuery(next);
    setRevealed(null);
    // INFO: § 8.14. The row is a different list now, so the stop goes back to its head rather than to whatever the previous query happened to have at that offset.
    setFocusedIndex(0);
  }

  /**
   * @param claimsField REQUIREMENTS.md § 8.14. Whether 검색 may take the keyboard as it
   * arrives (§ 13.8.). False for a walk along the strip, which the field would end.
   */
  function selectTab(id: string, { claimsField = true }: { claimsField?: boolean } = {}) {
    // WARN: Not merely a wasted render — `setRequestedTab` writes `localStorage` and broadcasts to every hook instance and tab, on every tap of the pack that is already open.
    if (id === activeTab) {
      return;
    }

    setSlideFrom(tabIds.indexOf(id) < activeIndex ? -1 : 1);
    setForcedTab(id === SEARCH_TAB ? SEARCH_TAB : null);
    // INFO: § 13.9. Walking to another tab ends the reveal — the ring belongs to the tap that asked for it, not to the panel.
    setRevealed(null);
    setFieldClaimsFocus(claimsField);

    // WARN: § 13.8. The search tab is deliberately never remembered. It is a place the user passes through with a word in hand, so reopening the panel onto an empty search — days later, over the pack they actually use — would be answering a question nobody asked twice.
    if (id !== SEARCH_TAB) {
      setRequestedTab(id);
    }
  }

  // INFO: REQUIREMENTS.md § 13.6. The ends do not wrap — 최근 사용 and the last pack are where the gesture stops, so a swipe never rotates past what the tabs show.
  function goToAdjacentTab(direction: SwipeDirection): Optional<string> {
    // WARN: The remembered tab survives the pending state (see `activeTab`) while `tabIds` does not, so until the packs land it is in no list and every neighbour of it is the wrong one.
    if (activeIndex < 0) {
      return undefined;
    }

    const next = tabIds[activeIndex + direction];

    if (!next) {
      return undefined;
    }

    selectTab(next);

    return next;
  }
}

type EmoticonCellProps = {
  className?: string;
  buttonClassName?: string;
  item: Emoticon;
  /**
   * The axis the scroller **around** this cell runs on, which is the axis
   * `touch-action` has to leave to the browser (`DESIGN.md § 7.15.1.`).
   *
   * WARN: Not a detail with a safe default — a cell tiles its scroller, so every
   * drag meant for it starts here, and a browser intersects `touch-action` down the
   * whole ancestor chain. Declaring `pan-y` inside § 13.8.'s `pan-x` row resolves to
   * `none` and the row cannot be dragged at all, which is exactly how it shipped.
   */
  scrollAxis?: "x" | "y";
  /** REQUIREMENTS.md § 8.14. This cell's place in the list its scroller holds, which is what the arrow keys step through. */
  index: number;
  /** REQUIREMENTS.md § 8.14. Whether this is the one cell of the list in the tab sequence (ARIA's roving tabindex). */
  isFocusable: boolean;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what puts the ring on plain `:focus` (`CELL_KEYBOARD_RING`). */
  isKeyboardDriven: boolean;
  /** REQUIREMENTS.md § 13.9. Whether this is the cell 따라하기 named, which is ringed until the panel is taken somewhere else. */
  isRevealed?: boolean;
  onSelect: (item: Emoticon) => void;
};

/** INFO: § 13.6. The grid and § 13.8.'s row draw the same cell — only the box around it, and the axis it scrolls on, differ. */
function EmoticonCell({
  className,
  buttonClassName,
  item,
  scrollAxis = "y",
  index,
  isFocusable,
  isKeyboardDriven,
  isRevealed = false,
  onSelect,
}: EmoticonCellProps) {
  // WARN: One value for both boxes below, never two spellings — they are intersected, so a pair that disagrees is `touch-action: none` and neither scroller moves.
  const panAxis = scrollAxis === "x" ? "touch-pan-x" : "touch-pan-y";

  return (
    // WARN: The axis is repeated on the overlay, not inherited — `touch-action` applies to the element a gesture starts on, and the overlay is now that element.
    // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the panel would stop scrolling (`DESIGN.md § 7.15.`).
    <HapticTarget className={className} overlayClassName={panAxis} keepsScroll>
      {/* WARN: A press held on an emoticon is the start of the § 13.6. swipe, but to WebKit it is a long-press on an image — the callout it raises takes the pointer stream with it. */}
      <button
        className={cn(
          panAxis,
          // WARN: REQUIREMENTS.md § 8.14. `ring-inset`, and a `primary-tint` fill under it. DESIGN.md § 3.2.'s offset ring is unreadable here for two reasons at once: the cells tile their scroller, which is `overflow-x-hidden` in the grid and `overflow-y-hidden` in § 13.8.'s row, so an outward ring is clipped away on every edge cell — the same trap § 7.5. records — and 2px of `primary` over an arbitrary user-authored picture is not a contrast anyone can rely on. The fill is what makes it legible; the ring is what makes it a focus ring.
          "rounded-sm p-2xs transition-colors select-none [-webkit-touch-callout:none] group-active:bg-surface-strong hover:bg-surface-soft focus-visible:bg-primary-tint focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset active:bg-surface-strong",
          // INFO: § 8.14. Additive to the `focus-visible` set above, which still answers a `Tab` arriving from outside the panel before any arrow has been pressed.
          isKeyboardDriven && CELL_KEYBOARD_RING,
          // INFO: § 13.9. A ring rather than the tabs' `bg-primary-tint` fill, which in this panel means "selected" — this cell is not selected, it is the one the tap was about.
          // WARN: § 13.9. `ring-inset`, or § 13.8.'s results row clips it. That row is `overflow-y-hidden` and its cells fill its height exactly, so an outset ring loses its top and bottom edges and reads as a broken box.
          isRevealed && "ring-2 ring-primary ring-inset",
          buttonClassName,
        )}
        type="button"
        // WARN: § 8.14. The roving tab stop. Every cell was a `<button>` and therefore a tab stop of its own, which put a pack's worth of them between the composer and its send control.
        tabIndex={isFocusable ? 0 : -1}
        // INFO: § 8.14. The item's own words, so a reader stepping the grid hears which picture each cell is rather than 이모티콘 forty times. Falls back where nobody has described it (§ 13.8.).
        aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "이모티콘"}
        {...{ [FOCUS_INDEX_ATTRIBUTE]: index }}
        onClick={(event) => {
          takeFocus(event);
          onSelect(item);
        }}
      >
        <PreloadImage
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          src={toEmoticonAssetUrl(item.id, "still-image", item.version)}
          alt=""
          loading="lazy"
          draggable={false}
        />
      </button>
    </HapticTarget>
  );
}

type SearchPaneProps = {
  className?: string;
  /** REQUIREMENTS.md § 13.8. Whether this pane is on screen, which is what the field's focus is keyed on. */
  isOpen: boolean;
  query: string;
  results: Emoticon[];
  /** REQUIREMENTS.md § 13.9. Whether the field has asked something the results do not yet answer. */
  isPending: boolean;
  /** REQUIREMENTS.md § 13.9.1. Whether what the field asked came back an error, which is neither pending nor a verdict. */
  hasFailed: boolean;
  /** REQUIREMENTS.md § 13.9. The item 따라하기 named, which is already first in `results`. */
  revealedId: Nullable<EmoticonItemId>;
  /** REQUIREMENTS.md § 13.9. The reveal this pane is showing, which the row is scrolled back to the head of — and the one way onto this tab that does not ask for the keyboard. */
  revealToken: Optional<number>;
  /** REQUIREMENTS.md § 8.14. Whether arriving here is a request to type. False for a walk along the tab strip, which this field taking the keyboard would end. */
  takesFocus: boolean;
  /** REQUIREMENTS.md § 8.14. Which cell of the row is the one in the tab sequence. */
  focusableIndex: number;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what paints the cells' focus ring. */
  isKeyboardDriven: boolean;
  /** REQUIREMENTS.md § 8.14. Held by the panel, which focuses it for ⌘E and for the row's `ArrowUp`. */
  fieldRef: RefObject<Nullable<HTMLInputElement>>;
  /** REQUIREMENTS.md § 8.14. The row is also the scroller the panel moves cell focus inside, so the ref is the panel's rather than this pane's. */
  rowRef: RefObject<Nullable<HTMLDivElement>>;
  onQueryChange: (query: string) => void;
  onSelect: (item: Emoticon) => void;
  /** REQUIREMENTS.md § 8.14. `↓` out of the field, which the panel owns because where it lands depends on what the search found. */
  onFieldKeys: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCellKeys: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCellFocus: (event: FocusEvent<HTMLDivElement>) => void;
  onSwipe: (direction: SwipeDirection) => void;
};

/**
 * REQUIREMENTS.md § 13.8. The search tab: a field, then one row of results that
 * scrolls sideways.
 *
 * WARN: One row and never a grid, and that is what pays for the keyboard exemption
 * (§ 13.6.). This is the only tab that can be on screen with the keyboard up, so it
 * has to fit in what the keyboard leaves rather than claiming half the shell.
 *
 * WARN: § 13.6.'s tab swipe is attached here too, but the results row is carved out
 * of it: the two gestures share an axis, so a swipe over a row that still has
 * somewhere to scroll would take every drag meant to reach the results further along
 * it. The row gives the axis up only once it has nothing left to scroll.
 */
function SearchPane({
  className,
  isOpen,
  query,
  results,
  isPending,
  hasFailed,
  revealedId,
  revealToken,
  takesFocus,
  focusableIndex,
  isKeyboardDriven,
  fieldRef,
  rowRef,
  onQueryChange,
  onSelect,
  onFieldKeys,
  onCellKeys,
  onCellFocus,
  onSwipe,
}: SearchPaneProps) {
  const swipeHandlers = useHorizontalSwipe(onSwipe);
  const trimmed = query.trim();

  // INFO: § 13.8. Keyed on the panel rather than on this pane's mount, which covers only one of the two ways in — the picker never unmounts, so reopening onto 검색 is a prop change with no mount to hang a focus on.
  // WARN: A layout effect and never the passive one. React flushes this inside the commit the tap renders, and WebKit raises the keyboard only for a `focus()` the user activation still covers — a frame later the field comes up focused with no keyboard, exactly as `message-search-bar.tsx` records.
  // WARN: § 13.9. And not when 따라하기 is what brought the tab up. Every other way onto this tab is a request to type; that one is a request to *look*, at an emoticon already sitting first in the row — raising the keyboard there puts the panel behind it and the thumb has further to travel than before the tap.
  // WARN: § 8.14. And not when the tab was reached by walking the strip with the arrows. That walk is a walk, and a field that claims the keyboard on arrival ends it mid-stride — leaving the strip only reachable again with a pointer, which is the one thing the arrows exist to avoid.
  useLayoutEffect(() => {
    if (isOpen && takesFocus && revealedId === null) {
      fieldRef.current?.focus();
    }
    // WARN: § 13.9. The reveal is deliberately not a dependency. It is cleared by the user typing, which is a keystroke the field already has focus for — listed here it would re-fire the focus on the frame the reveal is released and fight an IME mid-composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // WARN: § 13.9. Keyed on the token, not on the item — the row keeps whatever offset a previous search left it at, so a second 따라하기 would put its emoticon at the head of a row still scrolled somewhere else. Instant, for the reason § 13.6. gives against a smooth scroll while the strip is animating.
  // INFO: § 8.14. `rowRef` is listed because it is the panel's ref now rather than this pane's own, and a prop is a dependency the rule cannot see through. Its identity is stable, so it never re-runs on it.
  useLayoutEffect(() => {
    rowRef.current?.scrollTo({ left: 0 });
  }, [revealToken, rowRef]);

  return (
    // WARN: The swipe is taken here but `touch-pan-y` is **not** — a browser intersects `touch-action` down the whole ancestor chain, so reserving the horizontal axis on this box would meet the results row's `touch-pan-x` as `none` and that row would stop scrolling at all. Each child below declares its own axis instead.
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2xs p-xs", className)} {...swipeHandlers}>
      <div className="relative shrink-0 touch-pan-y">
        {/* WARN: The icon is inset by the field's own padding rather than sat against its edge — the pill's radius is half its height, so a glyph at `2xs` is inside the curve rather than beside the text. */}
        <Search
          className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-meta"
          strokeWidth={1.75}
        />
        <Input
          ref={fieldRef}
          // WARN: The two insets are the icon's own (`left-sm` plus its `size-4`, plus a `2xs` gap) and its mirror on the right. Left at `Input`'s defaults the text ran under the icon; trimmed to `2xs` on the right it ran into the pill's cap.
          className="h-(--emoticon-search-field) min-h-0 shrink-0 rounded-full py-0 pr-sm pl-8 text-body-sm"
          value={query}
          maxLength={MAX_KEYWORD_QUERY_LENGTH}
          placeholder="이모티콘 검색"
          // INFO: A word, not a sentence — the keyboard's return key has nothing to submit, since the row filters as it is typed.
          enterKeyHint="done"
          aria-label="이모티콘 검색"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onFieldKeys}
        />
      </div>
      {results.length === 0 ? (
        // INFO: § 13.8. The whole pane below the field, and with no row to scroll it is where the tab swipe has the most room to be made.
        <p className="flex flex-1 touch-pan-y items-center justify-center text-body-sm text-meta">
          {toEmptyMessage()}
        </p>
      ) : (
        <>
          {/* WARN: `touch-pan-x` is the mirror of the grid's `touch-pan-y` — this scroller runs on the horizontal axis, so that is the one the browser must keep. */}
          <div
            ref={rowRef}
            className="scrollbar-hidden flex min-h-0 flex-1 touch-pan-x gap-2xs overflow-x-auto overflow-y-hidden overscroll-contain"
            role="group"
            aria-label="검색 결과"
            onPointerDownCapture={keepAxisWhileScrollable}
            onKeyDown={onCellKeys}
            onFocus={onCellFocus}
          >
            {results.map((item, index) => (
              <EmoticonCell
                key={item.id}
                className="flex shrink-0"
                buttonClassName="size-(--emoticon-search-cell)"
                item={item}
                scrollAxis="x"
                index={index}
                isFocusable={index === focusableIndex}
                isKeyboardDriven={isKeyboardDriven}
                isRevealed={item.id === revealedId}
                onSelect={onSelect}
              />
            ))}
          </div>
          {/* WARN: § 13.9.1. A failed search still has a row when § 13.9. put the tapped item in it, and `toEmptyMessage` is only ever reached by an empty one — so without this the reveal was the one path where a failure said nothing at all. It costs the cells a line of height, and only while the sentence is up. */}
          {hasFailed && (
            <p className="shrink-0 touch-pan-y text-center text-body-sm text-meta">
              {SEARCH_FAILED_MESSAGE}
            </p>
          )}
        </>
      )}
    </div>
  );

  /**
   * WARN: § 13.9.1. Blank while the answer is still coming, and that is what the
   * pending flag is for. `찾는 이모티콘이 없어요` is a verdict, and the search is a
   * request now — delivered before it lands, every first search reads as having
   * failed for the couple of hundred milliseconds before its row appears.
   *
   * WARN: § 13.9.1. A request that failed gets a sentence of its own, and the blank
   * is what it used to get instead. `isPending` stayed latched on an error, so the
   * pane sat empty with no verdict and nothing naming why — indefinitely, since
   * nothing retries a query nobody re-types.
   */
  function toEmptyMessage(): string {
    if (hasFailed) {
      return SEARCH_FAILED_MESSAGE;
    }

    if (trimmed === "") {
      return "단어를 입력해 보세요";
    }

    return isPending ? "" : "찾는 이모티콘이 없어요";
  }

  /**
   * INFO: § 13.8. The row has first claim on the axis it scrolls, so the pane's swipe
   * only ever sees a drag that started somewhere the row is not — or on a row short
   * enough to have nothing to scroll, which is most searches.
   */
  function keepAxisWhileScrollable(event: PointerEvent<HTMLDivElement>) {
    const row = event.currentTarget;

    if (row.scrollWidth > row.clientWidth) {
      event.stopPropagation();
    }
  }
}

type TabButtonProps = PropsWithChildren<{
  /** The strip scrolls the active tab back into view, which needs the element rather than an index. */
  ref?: Ref<HTMLSpanElement>;
  className?: string;
  /** REQUIREMENTS.md § 8.14. This tab's place in `tabIds`, which the strip's arrow keys step through. */
  index: number;
  isActive: boolean;
  /** REQUIREMENTS.md § 8.14. Whether this is the strip's one tab stop (ARIA's roving tabindex). */
  isFocusable: boolean;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what puts the ring on plain `:focus` (`TAB_KEYBOARD_RING`). */
  isKeyboardDriven: boolean;
  label: string;
  onClick: () => void;
}>;

function TabButton({
  ref,
  className,
  index,
  isActive,
  isFocusable,
  isKeyboardDriven,
  label,
  children,
  onClick,
}: TabButtonProps) {
  return (
    // INFO: A pack switch is a selection among peers, the same thing the tab bar ticks for.
    // WARN: DESIGN.md § 7.15.1. The tabs tile the strip they scroll, so the switch would claim every drag that starts on one and the strip would not move. No `overlayClassName` beside it, unlike the § 13.6. grid cells: this scroller is the horizontal one.
    // WARN: DESIGN.md § 7.15.3. Never gated on `isActive` here — the selection lands synchronously, so gating unmounts the label before its activation and the tick is lost on the very tap that earned it.
    <HapticTarget ref={ref} className={cn("inline-flex shrink-0", className)} keepsScroll>
      <button
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md p-2xs transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
          // INFO: § 8.14. Additive, for the reason the cells' is.
          isKeyboardDriven && TAB_KEYBOARD_RING,
          isActive
            ? "bg-primary-tint"
            : "group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong",
        )}
        type="button"
        // WARN: § 8.14. The strip's roving tab stop. A library of two hundred packs is two hundred tab stops without it, all of them between the panel and the composer.
        tabIndex={isFocusable ? 0 : -1}
        aria-label={label}
        aria-pressed={isActive}
        {...{ [FOCUS_INDEX_ATTRIBUTE]: index }}
        onClick={(event) => {
          takeFocus(event);
          onClick();
        }}
      >
        {children}
      </button>
    </HapticTarget>
  );
}

function findPack(packs: EmoticonPackSummary[], id: string) {
  return packs.find((pack) => pack.id === id);
}

// INFO: REQUIREMENTS.md § 8.14. What `⇧←/→` refuses to fire over, since `Shift` plus an arrow belongs to the field's own selection there.
function isTextField(target: EventTarget): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * REQUIREMENTS.md § 8.14. Puts focus on the control that was pressed, which a pointer
 * otherwise never does here.
 *
 * WARN: `HapticTap` takes the tap on its own overlay and replays it as a scripted
 * `control.click()` (`DESIGN.md § 7.15.`), and a scripted click moves no focus — while
 * the real `pointerdown` landed on a `<span>` nothing can focus, so it dropped focus to
 * `<body>`. One click anywhere in this panel therefore ended keyboard navigation
 * outright: every handler below reads the key off the focused item, and there was no
 * longer one.
 *
 * WARN: `preventScroll`, for `focusItem`'s reason — the strip clipping this panel is
 * `overflow: hidden`, and `focus()` scrolls every scrollable ancestor it finds.
 */
function takeFocus(event: MouseEvent<HTMLButtonElement>): void {
  event.currentTarget.focus({ preventScroll: true });
}
