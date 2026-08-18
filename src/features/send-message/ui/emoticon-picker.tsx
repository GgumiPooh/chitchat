"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import {
  EMOTICON_KIND_NOUNS,
  EMOTICON_SETTINGS_ROUTE,
  MAX_KEYWORD_QUERY_LENGTH,
  MINI_SETTINGS_ROUTE,
  toEmoticonAssetUrl,
} from "@/shared/config";
import type { EmoticonPackType } from "@/shared/db";
import {
  A_MINUTE,
  A_SECOND,
  MINI_ANIMATION_LOOP_INTERVAL,
  cn,
  isBareKey,
  isCommandKey,
  isEditableElement,
  isShiftKey,
  revealWithin,
  toPreviousReplaySrc,
  toReplaySrc,
  useViewportReplay,
  type EmoticonItemId,
  type EmoticonPackId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import {
  EmptyState,
  HapticTarget,
  IconButton,
  Input,
  PreloadImage,
  RecentsAndFavoritesIcon,
} from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { josa } from "es-hangul";
import { ChevronDown, Clock, Delete, Search, Settings, Smile } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PropsWithChildren,
  type Ref,
  type RefObject,
} from "react";
import { useStorageState } from "synced-storage/react";
import {
  EMOTICON_GRID_COLUMNS,
  FOCUS_INDEX_ATTRIBUTE,
  MINI_GRID_COLUMNS,
  focusItem,
  readFocusIndex,
  toCrossingIndex,
  toNextFocusIndex,
} from "../model/emoticon-focus";
import {
  ACTIVE_TAB_KEY,
  EMOTICON_MENUS,
  MENU_LABELS,
  MINI_RECENTS_TAB,
  RECENTS_TAB,
  SEARCH_TAB,
  isPackTabId,
  isRecentsTabId,
  type EmoticonMenu,
} from "../model/emoticon-tabs";
import { toEmoticonsByIdsQuery } from "../model/emoticons-query";
import { toEmoticonPackItemsQuery } from "../model/pack-items-query";
import { toEmoticonPacksQuery } from "../model/packs-query";
import { useEmoticonFavorites } from "../model/use-emoticon-favorites";
import { useEmoticonSearch } from "../model/use-emoticon-search";
import { useHorizontalSwipe, type SwipeDirection } from "../model/use-horizontal-swipe";
import { useOutwardTabWarm } from "../model/use-outward-tab-warm";
import { useRecentEmoticons } from "../model/use-recent-emoticons";

// INFO: REQUIREMENTS.md § 13.6. Two taps on the same cell inside this window are the shortcut past the preview.
const DOUBLE_TAP_WINDOW = A_SECOND / 3;

// WARN: Hoisted so the pending query answers the same array every render — an inline `= []` mints a new identity, and the effect keyed on `packs` then re-runs its two `getBoundingClientRect` reads on every frame of the § 13.6. open animation.
const NO_PACKS: EmoticonPackSummary[] = [];

// WARN: Hoisted for `NO_PACKS`' reason — three queries below fall back to it, and an inline `= []` would hand a fresh identity to every render of the grid and of § 13.8.'s row.
const NO_ITEMS: Emoticon[] = [];

// WARN: § 13.5. Not the descriptor's `0`, and the pair is what keeps that guarantee: this holds the early mount back, `refetchPacks` on the open is what still lands an edit. Matches `PRELOAD_STALE_TIME`, since the two now mount on the same idle frame.
const PACKS_MOUNT_STALE_TIME = 5 * A_MINUTE;

/**
 * How many cells load eagerly, counting from the head of whatever list they draw.
 *
 * WARN: § 13.6. `lazy` on a cell that is already warm is the whole skeleton. A lazy
 * image starts loading after layout and its intersection check, so `img.complete` is
 * false when `PreloadImage` reads it back on mount however cached the bytes are — the
 * placeholder is committed and then faded out over an image that was ready all along.
 *
 * INFO: Five rows against the ~283px `--emoticon-panel-height` leaves the grid, which is more than fits at either column count. The rest stay `lazy`, so a two-hundred item pack is still loaded by being scrolled through.
 *
 * WARN: These load while the panel is still collapsed, since § 13.6. now mounts it before the first open — and that is the same twenty URLs the room's warm is fetching on the same idle frame, so what it costs is their priority rather than the requests.
 */
const EAGER_CELL_ROWS = 5;

// INFO: § 13.6. `EAGER_CELL_ROWS`' argument for the strip, which is one row: a tab is about 48px against a shell of at most 448, so this is what fits on screen with one to spare. Counted over `tabIds`, which is why the pack index is offset past 최근 사용 at the comparison.
const EAGER_TAB_COUNT = 9;

/**
 * REQUIREMENTS.md § 8.14. The menu bar's focus ring, traced on the **pill** rather than
 * on the 44 target around it (`MenuChip`), so it is drawn where the control is seen.
 *
 * WARN: A named group, because `HapticTarget` is an unnamed one — the press replay on
 * the same element reads that, and a bare `group-focus:` here would take whichever of
 * the two the markup happened to nest closest.
 *
 * WARN: `ring-inset`, where DESIGN.md § 3.2. spells an offset one. The pill is inset from
 * its track by the track's 4px padding and nothing else, so an offset ring lands on the
 * track's own edge — and `ring-offset-canvas` would paint a notch of the panel's colour
 * through it. This is `CELL_KEYBOARD_RING`'s exception for a second reason.
 */
const MENU_FOCUS_RING =
  "group-focus-visible/menu:ring-2 group-focus-visible/menu:ring-primary group-focus-visible/menu:ring-inset";

/** @see MENU_FOCUS_RING — `CELL_KEYBOARD_RING`'s plain `:focus` for the same pill, for as long as the panel is being driven by the keyboard. */
const MENU_KEYBOARD_RING =
  "group-focus/menu:ring-2 group-focus/menu:ring-primary group-focus/menu:ring-inset";

// INFO: § 13.9.1. One sentence for the two places a failed search is said — an empty pane, and the caption under a § 13.9. row that holds the tapped item and nothing the words found.
const SEARCH_FAILED_MESSAGE = "검색하지 못했어요";

// INFO: § 13.6. The tab's own label and the heading over its cells, which are the same words in two places.
const RECENTS_LABEL = "최근 사용";

/** REQUIREMENTS.md § 8.14. A tab, the cell focus is to land on in it, and the offset to read it at. */
type TabEntry = {
  /**
   * The tab this entry belongs to, where it belongs to one.
   *
   * WARN: § 8.14. Absent for a menu key, which asks for **a menu** rather than a tab —
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
   * WARN: **Every** open bumps it, not only `⌃E`. The toggle is a `button`, so a mouse open leaves focus on the composer's own control and the whole panel is unreachable from the keyboard until the user finds their way back in with `Tab` — which is the bug this shape exists to answer, and the reason `viaKeyboard` rides along rather than being assumed.
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
  /**
   * REQUIREMENTS.md § 8.14. The three menu digits and `⌃E`'s own open, which the room
   * forwards because the outcome it shares with them is its own state — the panel being
   * on screen at all.
   *
   * WARN: Carries a token for `searchRequest`'s reason: pressing the same digit twice
   * is two requests, and keyed on the menu alone the second is no change to see.
   */
  menuRequest?: Nullable<{ menu: EmoticonMenu; token: number }>;
  /** REQUIREMENTS.md § 13.8. Whether the search tab is the one on screen — the room exempts it from § 13.6.'s keyboard gate. */
  onSearchTabChange?: (isOnSearchTab: boolean, query: string) => void;
  onSelect: (emoticon: Emoticon) => void;
  onQuickSend: (emoticon: Emoticon) => void;
  /**
   * REQUIREMENTS.md § 13. A mini goes into the **draft** rather than being staged as a
   * preview.
   *
   * WARN: § 2.2. stores a mini as a fragment of a `text` message and never in
   * `messages.emoticon_item_id`, so staging one would promise a send that has no row to
   * land in. That makes this the pointer's path as well as the keyboard's — see
   * `handleSelect`.
   */
  onInsert?: (emoticon: Emoticon) => void;
  /** 미니's own 지우기 — removes one character or one mini from the end of the draft, exactly what a Backspace on the field would take. */
  onDeleteLast?: () => void;
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
  menuRequest,
  onSearchTabChange,
  onSelect,
  onQuickSend,
  onInsert,
  onDeleteLast,
}: EmoticonPickerProps) {
  // WARN: Read straight from storage rather than seeded into `useState` — the panel can mount during hydration, where the first snapshot is still the fallback and a seeded state would never pick the stored tab up.
  const [storedTab, setRequestedTab] = useStorageState<string>(ACTIVE_TAB_KEY, RECENTS_TAB, {
    strategy: "localStorage",
  });
  // INFO: § 13.8. The search tab is reached by a tap in the composer rather than chosen, so it stands beside the remembered tab instead of replacing it — the panel reopens on the pack the user last picked, not on a search they have since finished.
  const [forcedTab, setForcedTab] = useState<Nullable<string>>(null);
  const [query, setQuery] = useState("");
  // WARN: State and not a ref, though it is only ever compared. The adjustment below runs during render, where a ref may not be read at all — this is React's own "adjusting state when a prop changes", and the previous token has to be readable there.
  // WARN: Seeded `undefined`, never from `searchRequest`. Seeding from it marks a request as applied before anything applies it, and the tap then opens the panel on the remembered pack with an empty field. § 13.6.'s idle mount now normally lands well before any tap, so the mount arrives with no request in hand — which makes the seed correct for the ordinary case as well as for the one this was written against, where the tap and the mount were the same moment.
  const [appliedSearchToken, setAppliedSearchToken] = useState<Optional<number>>(undefined);
  // WARN: § 13.9. Seeded `undefined` for `appliedSearchToken`'s reason.
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
  /**
   * REQUIREMENTS.md § 8.14. Which menu chip holds the bar's one tab stop, which is
   * **not** the open menu while the arrows are walking it.
   *
   * WARN: The menu bar activates manually where the strip below it activates
   * automatically, and the two are different on purpose: crossing 미니 to reach 검색
   * would swap the whole panel — a different kind at a different column count — for a
   * menu the reader was only passing through, where crossing a pack costs one list.
   */
  const [focusedMenu, setFocusedMenu] = useState<Nullable<EmoticonMenu>>(null);
  /** @see focusedMenu — the menu the stop was last synced to, so the reset fires on a change rather than on a difference. */
  const [syncedMenu, setSyncedMenu] = useState<Nullable<EmoticonMenu>>(null);
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
  }

  /**
   * WARN: The release, and it is not optional. `chat-room.tsx` gates the panel's
   * existence on a one-way `hasMountedEmoticonPanel`, so this component never
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
  const router = useRouter();
  const menuBarRef = useRef<Nullable<HTMLDivElement>>(null);
  /**
   * REQUIREMENTS.md § 13.6. Where each kind's menu was last left, so stepping across the
   * menu bar and back returns to the pack rather than to 최근 사용.
   *
   * WARN: A ref and deliberately not storage. `ACTIVE_TAB_KEY` remembers **one** tab
   * across sessions and that is the whole of what § 13.6. promises; this is the shorter
   * memory a single panel session needs, and writing it would mean two stored answers to
   * "which tab" that can disagree.
   */
  const lastTabByKindRef = useRef<Record<EmoticonPackType, Nullable<string>>>({
    emoticon: null,
    mini: null,
  });
  const tabStripRef = useRef<Nullable<HTMLDivElement>>(null);
  const activeTabRef = useRef<Nullable<HTMLSpanElement>>(null);
  const settingsButtonRef = useRef<Nullable<HTMLButtonElement>>(null);
  const deleteButtonRef = useRef<Nullable<HTMLButtonElement>>(null);
  /**
   * REQUIREMENTS.md § 8.14. Set the one time 검색 is opened by `Space`/`Enter` on its
   * own menu button, so `SearchPane`'s mount effect below leaves focus where the reader
   * put it instead of pulling it into the field.
   */
  const skipSearchAutofocusRef = useRef(false);
  // INFO: § 8.14. Whichever scroller currently holds the cells — the grid, or § 13.8.'s results row. One ref because the two are branches of the same ternary and never coexist.
  const cellScrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const searchFieldRef = useRef<Nullable<HTMLInputElement>>(null);
  /**
   * REQUIREMENTS.md § 8.14. The last `menuRequest` that has been acted on.
   *
   * WARN: A ref where the two token comparisons above are state, and the difference is
   * where each is made: those are render-phase adjustments, where a ref may not be read
   * at all, and this one is an effect.
   *
   * WARN: Empty rather than seeded from the prop, and it was the other way round while a
   * repeated key still closed the panel — a picker mounting with such a request in hand
   * would have closed one the same keystroke had just opened. The panel is mounted by
   * that keystroke whenever it beats § 13.6.'s idle mount, so seeded it now drops the
   * only request that open will ever get and lands on the stored tab instead.
   */
  const appliedMenuTokenRef = useRef<Optional<number>>(undefined);
  /**
   * REQUIREMENTS.md § 8.14. The last 검색 menu key whose field focus has been given.
   *
   * WARN: § 8.14. The token and never a flag set where the request is applied. A flag was
   * only ever read by an effect keyed on `isOpen`/`isSearching`, so the key pressed at a
   * panel already open on 검색 changed neither, never re-ran it, and left the flag raised
   * to fire on whichever later arrival on the tab did change one.
   */
  const focusedFieldTokenRef = useRef<Optional<number>>(undefined);
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
  // INFO: § 8.14. After the recents 더보기 expands, focus the emoticon that filled its old slot.
  const pendingExpandFocusRef = useRef<Optional<number>>(undefined);
  const [slideFrom, setSlideFrom] = useState<SwipeDirection>(1);
  const lastTapRef = useRef<Nullable<{ at: number; id: EmoticonItemId }>>(null);
  const swipeHandlers = useHorizontalSwipe(goToAdjacentTab);
  // WARN: § 13.6. Read only. `remember` belongs to the send, not to the tap — recording it here re-sorts 최근 사용 between the two taps of a double tap, moving the cell out from under the second one.
  const { recentIds: recentIdsByKind } = useRecentEmoticons();
  // INFO: § 13.6. The same descriptor `useEmoticonPreload` warmed, so the panel opens on the cached list rather than on `isPending`.
  // WARN: § 13.8. Every pack, hidden ones included, and summaries only. The hidden ones are here because § 13.9.'s 따라하기 needs to name a pack this user has taken out of the strip; what makes such a pack's emoticons *findable* is that the server's search applies no `enabled` filter either.
  // WARN: § 13.5.'s "an edit lands the next time the panel opens" is `refetchOnOpen` below, and no longer this mount. The panel is mounted ~2s into the room now rather than by the tap, so the descriptor's own `staleTime: 0` put a packs request on every visit to a room nobody opened the panel in — the request `PRELOAD_STALE_TIME` exists to withhold.
  const {
    data: packs = NO_PACKS,
    isPending,
    refetch: refetchPacks,
  } = useQuery({ ...toEmoticonPacksQuery(), staleTime: PACKS_MOUNT_STALE_TIME });
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
    isRecentsTabId(requestedTab) ||
    requestedTab === SEARCH_TAB ||
    (isPackTabId(requestedTab) && (isPending || findPack(visiblePacks, requestedTab)))
      ? requestedTab
      : RECENTS_TAB;
  const isSearching = activeTab === SEARCH_TAB;
  // INFO: § 13.6. Every pack's kind, hidden ones included — a 따라하기 can name a pack this user has taken out of the strip, and the menu still has to be able to say which kind it was.
  const packTypes = new Map(packs.map((pack) => [pack.id, pack.type] as const));
  /**
   * REQUIREMENTS.md § 13.6. The open menu, **derived from the open tab** rather than
   * stored beside it.
   *
   * WARN: This is what keeps one `ACTIVE_TAB_KEY` answering for three menus. A pack id
   * already says which kind it is, so a second stored value would be a copy that can
   * disagree with it — and `useEmoticonPreload` reads that key too, so the copy would
   * have to be kept in a hook that has no reason to know menus exist.
   *
   * INFO: A stored pack id resolves before its list lands (see `activeTab`), and a kind nobody has answered for yet reads as `emoticon` — so a remembered 미니 pack opens on 이모티콘 for the one frame before the packs arrive, exactly as its own tab does.
   */
  const activeMenu = toMenuOf(activeTab);
  // INFO: § 13.6. Which kind the two regions below hold. 검색 draws neither, and reads as 이모티콘 so nothing has to branch on a third case.
  const menuKind: EmoticonPackType = activeMenu === "mini" ? "mini" : "emoticon";
  const kindNouns = EMOTICON_KIND_NOUNS[menuKind];
  const menuPacks = visiblePacks.filter((pack) => pack.type === menuKind);
  const recentsTab = menuKind === "mini" ? MINI_RECENTS_TAB : RECENTS_TAB;
  // WARN: § 13.6. Empty while the summaries are still in flight, which is the one case the heading is withheld — a pack tab knows its own name a round trip before it knows its items.
  const activeTabLabel = isRecentsTabId(activeTab)
    ? RECENTS_LABEL
    : (findPack(menuPacks, activeTab)?.name ?? "");
  // INFO: § 13.6. This menu's own stored list, which is the whole of the kind filter — `useRecentEmoticons` keeps one per kind, written from what the send carried.
  const recentIds = recentIdsByKind[menuKind];
  // WARN: § 8.14. The arrow step **and** the `grid-cols-*` class below, which are one decision written twice — see `MINI_GRID_COLUMNS`.
  const columns = menuKind === "mini" ? MINI_GRID_COLUMNS : EMOTICON_GRID_COLUMNS;
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

  const { favorites: allFavorites = [] } = useEmoticonFavorites();
  const [recentsVisibleRows, setRecentsVisibleRows] = useState(2);

  const byId = new Map(recentItems.map((item) => [item.id, item] as const));
  // INFO: § 13.1. 최근 사용 is a tab like any other, so hiding a pack takes its items out of this list too — an emoticon sent through § 13.9. from a hidden pack is remembered and 침착하게 not drawn here.
  // WARN: § 13.6. The kind is **not** filtered here as well. `recentIds` is already this kind's own list, and a second cut through `packTypes` would drop every recent for as long as the pack summaries are still in flight — a 최근 사용 that draws nothing on the frame the panel opens.
  const visiblePackIds = new Set(visiblePacks.map((pack) => pack.id));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((item): item is Emoticon => item !== undefined && visiblePackIds.has(item.packId));

  const favorites = allFavorites.filter(
    (item) => packTypes.get(item.packId) === menuKind && visiblePackIds.has(item.packId),
  );
  const shown = toShownItems();
  const hasMoreRecents = recents.length > recentsVisibleRows * columns;
  const recentsSliceCount = hasMoreRecents
    ? recentsVisibleRows * columns - 1
    : recentsVisibleRows * columns;
  const displayedRecents = recents.slice(0, recentsSliceCount);
  const recentsSectionCount =
    recents.length === 0
      ? 0
      : hasMoreRecents
        ? recentsVisibleRows * columns
        : recents.length;
  const totalRecentsAndFavoritesCount = recentsSectionCount + favorites.length;
  const gridItemCount =
    isRecentsTabId(activeTab) && menuKind !== "mini"
      ? totalRecentsAndFavoritesCount
      : shown.length;
  // INFO: § 13.6. The second region's own list, which is this menu's alone — 검색 has a field there instead and therefore no tabs at all.
  const tabIds = isSearching ? [] : [recentsTab, ...menuPacks.map((pack) => pack.id)];
  const activeIndex = tabIds.indexOf(activeTab);
  const tabThumbnailUrls = menuPacks.flatMap((pack) =>
    pack.thumbnailItemId
      ? [
          toEmoticonAssetUrl(
            pack.thumbnailItemId,
            "still-image",
            pack.thumbnailVersion ?? undefined,
          ),
        ]
      : [],
  );

  // INFO: § 13.6. The room's warm covers the tab that opens and no further, so the tabs around it are heated from here, outward.
  useOutwardTabWarm({ isOpen, activeTab, tabIds, recents, tabThumbnailUrls, kind: menuKind });
  // WARN: § 13.5. The open is what re-asks for the list, since the mount stopped being the tap (see the query above). Rising edge only — every render while open would re-ask on each one.
  useEffect(() => {
    if (isOpen) {
      void refetchPacks();
    }
  }, [isOpen, refetchPacks]);

  // WARN: § 8.14. Adjusted during render rather than in an effect. The tab's own cells render in this same commit, so a stop reset a frame later is one frame in which `tabIndex={0}` sits on a cell of the pack that just left.
  if (focusedTab !== activeTab) {
    setFocusedTab(activeTab);
    setFocusedIndex(0);
    // INFO: Collapse the 더보기 expansion back to the initial 2 rows whenever the user navigates to a different tab.
    setRecentsVisibleRows(2);
  }

  // WARN: § 8.14. Keyed on the menu **changing**, never on it differing from the stop — walking the bar deliberately leaves the stop off the open menu, and a plain inequality would snap it back on the next render and make the arrows appear dead.
  if (syncedMenu !== activeMenu) {
    setSyncedMenu(activeMenu);
    setFocusedMenu(activeMenu);
  }

  const focusableMenu = focusedMenu ?? activeMenu;

  // WARN: § 8.14. Clamped rather than reset by every change to the list. A search narrows its results on each keystroke while focus stays in the field, and a stop past the end would leave the row with no tab stop at all.
  const focusableIndex = Math.min(focusedIndex, gridItemCount - 1);
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
   * REQUIREMENTS.md § 8.14. Focus into the panel when `⌃E` opened it, since a key that
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
      // WARN: § 8.14. `noteKeyboardUse` cannot hear the key that opened the panel — ⌃E is pressed with focus outside it, so the event never travels through it. Left unsaid, the cell this is about to focus paints no ring: `:focus-visible` judges a programmatic focus by whether the *previously* focused element had it, and on a freshly loaded page that is `<body>`, which never does. Reaching the panel from the composer hid it, a text field always matching.
      // WARN: § 8.14. And it is set from the request rather than to `true`, because a pointer open makes one of these too now. The panel outlives every close, so a stale `true` from an earlier ⌃E would light the whole grid up for a mouse the moment it reopened.
      setIsKeyboardDriven(focusRequest.viaKeyboard);
    }

    const entry = pendingEntryRef.current;

    if (!entry) {
      return;
    }

    // WARN: § 8.14. Dropped on a tab that is no longer the one asked for, and on a closed panel — reaching for the composer closes it (§ 13.6.), and a pack landing after that would pull the caret back out of the field.
    // WARN: § 8.14. And dropped to an unanswered 검색 menu key. The room bumps this request off that keystroke too, and `enterTab` prefers a cell — answered here it takes the caret to the first search result rather than to the field the key asked for.
    if (
      !isOpen ||
      (entry.tab !== undefined && entry.tab !== activeTab) ||
      (menuRequest?.menu === "search" && menuRequest.token !== focusedFieldTokenRef.current)
    ) {
      pendingEntryRef.current = null;

      return;
    }

    if (enterTab(entry)) {
      pendingEntryRef.current = null;
    }
    // WARN: `enterTab` is deliberately not a dependency. It closes over this render's tab and list, which is exactly what the deps below already state — listed, it would re-run the focus on every render of an open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, focusRequest.token, gridItemCount, isOpen, menuRequest]);

  // WARN: § 13.8. The room exempts this tab from § 13.6.'s keyboard gate, so it has to be told on every change — reported off the tab rather than off the field's focus, or the frame between a blur and the keyboard actually retracting closes the panel underneath the user.
  useEffect(() => {
    onSearchTabChange?.(isSearching, query);
  }, [isSearching, query, onSearchTabChange]);

  /**
   * REQUIREMENTS.md § 8.14. The three menu digits, applied here rather than during render
   * because the token it is compared against is a ref, which a render-phase adjustment
   * may not read (see `appliedMenuTokenRef`).
   *
   * INFO: A request for the menu already on screen is not a case of its own — nothing
   * closes from here, and `selectMenu` finds nothing to change.
   *
   * INFO: The frame it costs is invisible, because the same keystroke has already asked the room to open the panel — the request and the open land together.
   */
  useEffect(() => {
    if (!menuRequest || menuRequest.token === appliedMenuTokenRef.current) {
      return;
    }

    appliedMenuTokenRef.current = menuRequest.token;
    selectMenu(menuRequest.menu);
    // WARN: `selectMenu` is deliberately not a dependency — it closes over this render's tabs, which is what the deps already state, and listing it would re-run the request on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuRequest?.token]);

  /**
   * REQUIREMENTS.md § 8.14. The 검색 menu key's focus, which cannot ride `SearchPane`'s
   * own — that one is keyed on the panel opening, and this arrives at a panel already
   * open.
   *
   * WARN: A layout effect, for `SearchPane`'s reason: WebKit raises the keyboard only
   * for a `focus()` still covered by the user activation, and a passive effect lands a
   * scheduler task past it.
   *
   * WARN: § 8.14. It reads `menuRequest` itself rather than a flag the effect above
   * raises, because that effect is a passive one and runs *after* this — on the commit
   * the token arrives in, which is the only commit a panel already open on 검색 has. It
   * therefore waits for `isOpen` instead: a press made with the keys up opens nothing
   * until they retract (§ 13.6.).
   *
   * WARN: § 8.14. `enterTab` and never the field where a query already has results —
   * ⌃1/⌃E/토글 raising the keyboard over a grid the reader only meant to look back at is
   * the cost, not the point, of the field-focus below.
   */
  useLayoutEffect(() => {
    if (
      menuRequest?.menu !== "search" ||
      menuRequest.token === focusedFieldTokenRef.current ||
      !isOpen ||
      !isSearching
    ) {
      return;
    }

    focusedFieldTokenRef.current = menuRequest.token;

    if (shown.length > 0) {
      enterTab({ index: 0 });
    } else {
      searchFieldRef.current?.focus();
    }
    // WARN: `enterTab` is deliberately not a dependency, for the reason given where the other effect excludes it — it closes over this render's `shown`, which is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isSearching, menuRequest, shown.length]);

  // INFO: § 8.14. After 더보기 expands the recents rows, focus the emoticon that now occupies the slot where 더보기 was — a useLayoutEffect so the DOM is updated before focus() is called.
  useLayoutEffect(() => {
    if (pendingExpandFocusRef.current === undefined) {
      return;
    }
    const targetIndex = pendingExpandFocusRef.current;
    pendingExpandFocusRef.current = undefined;
    const scroller = cellScrollerRef.current;
    if (scroller) {
      focusItem(scroller, targetIndex);
    }
  }, [recentsVisibleRows]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col rounded-lg border border-hairline bg-canvas",
        // INFO: § 13.8. 검색 is the one menu that may share the screen with the keyboard, so it is drawn at a height that fits in what the keyboard leaves rather than at the other two menus' half-shell.
        // WARN: The same 200ms `ease-out` the § 13.6. clipping strip animates its own height with, and the two MUST stay identical. Left instant here the asymmetry was visible only one way: growing, the taller panel is clipped by the strip and revealed as it opens, so it reads as smooth — shrinking, the panel collapses in one frame inside a strip that is still catching up.
        "transition-[height] duration-200 ease-out",
        isSearching ? "h-(--emoticon-search-panel-height)" : "h-(--emoticon-panel-height)",
        className,
      )}
      onKeyDown={handlePanelKeys}
      // WARN: § 8.14. Capture and not the bubbled phase, so no child that stops `pointerdown` can hide a pointer press from the panel — which is how the rings stayed lit under a mouse once one scroller inside here did exactly that.
      onPointerDownCapture={() => setIsKeyboardDriven(false)}
    >
      {/* INFO: § 13.6. The first region — which menu the two below it belong to. */}
      {/* INFO: REQUIREMENTS.md § 8.14. ARIA's toolbar again: one tab stop for the row, the bare arrows walking it, and what they land on opening — the same automatic activation the strip below and § 13.6.'s swipe already use. */}
      {/* INFO: DESIGN.md § 7.1. One track with the fill inside it rather than three separate chips, so the three menus read as one control choosing between them. */}
      {/* WARN: The fill does not travel, which is what keeps `LibrarySegments`' objection answered — the strip below runs a selection fill of its own, and a second *animated* indicator one row above it is what reads as two things moving at once. `transition-colors` and never a sliding thumb. */}
      {/* INFO: No rule under it: the track already separates itself from what follows, and the strip below keeps its own so the three regions are still told apart. */}
      {/* INFO: The track is as wide as the three labels and no wider (`w-fit`), then centred in the panel — `self-center`, since a flex column would otherwise stretch it to the full width. */}
      {/* WARN: The two margins are deliberately unequal. What sits under the track is not the panel's edge but the strip's own `py-2xs`, so an even `m-2xs` reads as 4px above against 8px below; 6 and 2 are what put the same 6px of air on both sides. Their sum is unchanged, which is why `--emoticon-menu-height` is. */}
      <div
        ref={menuBarRef}
        className="mt-1.5 mb-0.5 flex w-fit shrink-0 items-center gap-2xs self-center rounded-full bg-surface-soft p-2xs"
        role="toolbar"
        aria-label="이모티콘 메뉴"
        onKeyDown={handleMenuKeys}
      >
        {EMOTICON_MENUS.map((menu, index) => (
          <MenuSegment
            key={menu}
            index={index}
            isSelected={menu === activeMenu}
            // WARN: § 8.14. The row's roving tab stop, so three menus are one stop rather than three between the panel and the composer. It follows the **focused** menu rather than the open one, because the arrows walk this bar without opening what they land on.
            isFocusable={menu === focusableMenu}
            isKeyboardDriven={isKeyboardDriven}
            onClick={() => {
              setFocusedMenu(menu);
              selectMenu(menu);
            }}
          >
            {MENU_LABELS[menu]}
          </MenuSegment>
        ))}
      </div>
      {isSearching ? (
        <SearchPane
          isOpen={isOpen}
          query={query}
          results={shown}
          packTypes={packTypes}
          isPending={isSearchPending}
          hasFailed={hasSearchFailed}
          revealedId={revealedId}
          revealToken={appliedRevealToken}
          focusableIndex={focusableIndex}
          isKeyboardDriven={isKeyboardDriven}
          fieldRef={searchFieldRef}
          rowRef={cellScrollerRef}
          skipAutofocusRef={skipSearchAutofocusRef}
          onQueryChange={changeQuery}
          onSelect={handleSelect}
          onFieldKeys={handleFieldKeys}
          onCellKeys={handleCellKeys}
          onCellFocus={trackCellFocus}
        />
      ) : (
        <>
          {/* INFO: § 13.6. The second region — 최근 사용, then this menu's own packs. */}
          {/* WARN: § 13.6. Above the grid now rather than under it, which is what the third region costs: the two navigation rows stack at the top and the cells take the rest. The thumb reaches the strip less easily than it did, and the grid — the thing actually being tapped — is what moved down to meet it. */}
          {/* WARN: The horizontal inset is the first and last tab's margin, never the strip's `padding-inline`. WebKit reports `scrollWidth === clientWidth` until the content already overflows *without* `padding-right`, so a strip padded that way has a dead band the width of that padding where it is over-full and cannot be scrolled at all. */}
          {/* INFO: REQUIREMENTS.md § 8.14. ARIA's toolbar: one tab stop for the whole strip, and the bare arrows walking it — which open what they land on, exactly as § 13.6.'s swipe does. */}
          {/* WARN: `touch-pan-x` and `overscroll-contain` are what § 13.8.'s pane already carries, and this strip is the one horizontal scroller that had neither. A drag here is never perfectly horizontal, so WebKit spent the vertical component on whatever ancestor would take it — the room panning a few pixels under every sweep of the thumb, which is the wobble reported on iOS. */}
          <div className="flex shrink-0 items-center border-b border-hairline-soft">
            <div
              ref={tabStripRef}
              className="scrollbar-hidden flex min-w-0 flex-1 touch-pan-x gap-2xs overflow-x-auto overflow-y-hidden overscroll-contain py-2xs [&>*:first-child]:ml-2xs [&>*:last-child]:mr-2xs"
              role="toolbar"
              aria-label={kindNouns.pack}
              onKeyDown={handleTabStripKeys}
            >
              <TabButton
                ref={activeTab === recentsTab ? activeTabRef : undefined}
                index={0}
                isActive={activeTab === recentsTab}
                isFocusable={focusableTabId === recentsTab}
                isKeyboardDriven={isKeyboardDriven}
                label={RECENTS_LABEL}
                onClick={() => selectTab(recentsTab)}
              >
                {menuKind === "mini" ? (
                  <Clock className="size-5 text-meta" strokeWidth={1.75} />
                ) : (
                  <RecentsAndFavoritesIcon className="size-5 text-meta" />
                )}
              </TabButton>
              {/* WARN: § 13.1. `menuPacks` is `visiblePacks` cut to this menu's kind, and never `packs` — the list carries hidden packs so § 13.8. can search them, and a hidden pack drawn here is a tab `activeTab` resolves away from, so the tap does nothing but overwrite the remembered pack with an id that can never be restored. */}
              {menuPacks.map((pack, index) => (
                <TabButton
                  key={pack.id}
                  ref={activeTab === pack.id ? activeTabRef : undefined}
                  // WARN: § 8.14. Offset past 최근 사용, so it indexes `tabIds` — the array `goToAdjacentTab` and the strip's own arrows both step through. 검색 is a menu now and no longer sits in front of it.
                  index={index + 1}
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
                      // INFO: § 13.6. Warmed and decoded before the panel opens, so the head of the strip is drawn rather than plated.
                      hasDeferredSkeleton
                      // WARN: § 13.3. Each of these is a session check, a row read and a presign, and the strip scrolls — past what fits on screen, every pack in the library would spend one on the frame the panel first opens.
                      loading={index + 1 < EAGER_TAB_COUNT ? "eager" : "lazy"}
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
              <IconButton
                ref={settingsButtonRef}
                className="shrink-0 text-meta"
                Icon={Settings}
                haptic
                aria-label={menuKind === "mini" ? "미니 관리" : "이모티콘 관리"}
                onClick={() =>
                  router.push(
                    menuKind === "mini" ? MINI_SETTINGS_ROUTE : EMOTICON_SETTINGS_ROUTE,
                  )
                }
                onKeyDown={handleSettingsButtonKeys}
              />
            </div>
            {/* INFO: 미니 only — a mini is written into the composer's draft rather than staged, so this is the picker's own Backspace for it. */}
            {menuKind === "mini" && (
              <>
                <div className="mr-2xs h-6 w-px shrink-0 bg-hairline-soft" aria-hidden />
                <IconButton
                  ref={deleteButtonRef}
                  className="mr-2xs"
                  Icon={Delete}
                  haptic
                  keepsFocus
                  aria-label="지우기"
                  onClick={onDeleteLast}
                  onKeyDown={handleDeleteButtonKeys}
                />
              </>
            )}
          </div>
          {/* INFO: § 13.6. The third region — the cells, which is the only one of the three that scrolls vertically. */}
          {/* WARN: `overflow-x-hidden` is what keeps the § 13.6. slide inside the panel — a vertical-only scroller still resolves its horizontal axis to `auto`. */}
          {/* WARN: `touch-pan-y` leaves the vertical scroll native while denying the browser the horizontal axis, which it would otherwise consume before the § 13.6. swipe ever sees it. */}
          <div
            ref={cellScrollerRef}
            className="scrollbar-hidden min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-xs"
            onKeyDown={handleCellKeys}
            onFocus={trackCellFocus}
            {...swipeHandlers}
          >
            {/* INFO: DESIGN.md § 7.10. 보관함's month header pattern, sized down from `title-sm` to `body-sm` for this panel's tighter grid — `meta`, inside the scroller so it travels with the cells rather than pinning above them. */}
            {/* WARN: § 8.14. Not a focus target, so it carries no `FOCUS_INDEX_ATTRIBUTE` — the arrows read cells off that attribute and a heading in the list would be a step onto nothing. */}
            {!isRecentsTabId(activeTab) && activeTabLabel !== "" && (
              <h2 className="pb-xs text-body-sm text-meta">{activeTabLabel}</h2>
            )}
            {/* WARN: § 13.6. The tab's own items are a request now, so the grid waits for them as it waits for the list. Drawn before they land, a pack tab paints `이 묶음에는 이모티콘이 없어요` over a pack that has plenty — the verdict-before-the-answer § 13.9.1. removed from the search pane. */}
            {/* WARN: § 13.6. 최근 사용 is the default tab and its ids resolve through a request of their own, so it needs the same guard — without it the panel flashes `최근 사용한 이모티콘이 여기에 보여요` every time it opens ahead of the preload. Every send used to do it too, a new id being a cold key; `emoticons-query.ts` holds the previous answer over for exactly that. */}
            {/* INFO: § 13.6. A pack tab holds nothing over, deliberately, where 최근 사용 does. The key there is the same list plus one item; here it is a **different pack**, and what would slide in under the new tab is another pack's shelf, swapped out a round trip later. */}
            {/* INFO: § 13.6. So the animation below decorates the arrival rather than the gesture — a warm tab slides at once, a cold one is blank for a round trip and slides after. Recorded and not fixed: waiting is still better than painting `이 묶음에는 이모티콘이 없어요` over a pack that is full. */}
            {isPending ||
            (activePackId !== null && isPackPending) ||
            (isRecentsTabId(activeTab) && isRecentsPending) ? null : (
              // WARN: Keyed by the tab so each pack mounts fresh — an enter animation on an updated subtree never replays.
              <div
                key={activeTab}
                className={cn(
                  "animate-in duration-200",
                  slideFrom === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6",
                )}
              >
                {isRecentsTabId(activeTab) ? (
                  menuKind === "mini" ? (
                    // INFO: § 13.6. 미니 메뉴의 최근 사용은 즐겨찾기 없이 최근 사용 목록만 표시한다.
                    recents.length === 0 ? (
                      <EmptyState
                        className="border-0 bg-transparent"
                        Icon={Smile}
                        description="최근 사용한 미니이모티콘이 여기에 보여요"
                      />
                    ) : (
                      <div
                        className="grid grid-cols-6 gap-2xs"
                        role="group"
                        aria-label="최근 사용한 미니이모티콘"
                      >
                        {recents.map((item, index) => (
                          <EmoticonCell
                            key={item.id}
                            className="flex"
                            buttonClassName="aspect-square w-full"
                            item={item}
                            index={index}
                            isFocusable={index === focusableIndex}
                            isWarmed
                            eagerCount={EAGER_CELL_ROWS * columns}
                            isKeyboardDriven={isKeyboardDriven}
                            isMini
                            onSelect={handleSelect}
                          />
                        ))}
                      </div>
                    )
                  ) : (
                    // INFO: § 13.6. 이모티콘 메뉴의 최근 사용 탭은 두 섹션(최근사용 / 즐겨찾기)으로 분리 렌더링한다.
                    <div className="flex flex-col gap-xs">
                      <section>
                        {/* WARN: § 8.14. Not a focus target — see the pack tab heading comment above. */}
                        <h2 className="pb-xs text-body-sm text-meta">최근 사용</h2>
                        {recents.length === 0 ? (
                          <EmptyState
                            className="border-0 bg-transparent"
                            Icon={Smile}
                            description="최근 사용한 이모티콘이 여기에 보여요"
                          />
                        ) : (
                          <>
                            {/* WARN: § 8.14. `focusableIndex` is a flat index across both recents and favorites — recents come first, so their indices are 0…recentsSlice.length−1. */}
                            <div
                              className="grid grid-cols-4 gap-2xs"
                              role="group"
                              aria-label="최근 사용한 이모티콘"
                            >
                              {displayedRecents.map((item, index) => (
                                <EmoticonCell
                                  key={item.id}
                                  className="flex"
                                  buttonClassName="aspect-square w-full"
                                  item={item}
                                  index={index}
                                  isFocusable={index === focusableIndex}
                                  isWarmed
                                  eagerCount={EAGER_CELL_ROWS * columns}
                                  isKeyboardDriven={isKeyboardDriven}
                                  isMini={false}
                                  onSelect={handleSelect}
                                />
                              ))}
                              {hasMoreRecents && (
                                <button
                                  className={cn(
                                    "flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-sm text-body-sm text-meta transition-colors select-none [-webkit-touch-callout:none] hover:bg-surface-soft hover:text-body focus-visible:bg-primary-tint focus-visible:text-body focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset active:bg-surface-soft active:text-body",
                                    isKeyboardDriven && CELL_KEYBOARD_RING,
                                  )}
                                  type="button"
                                  tabIndex={recentsSliceCount === focusableIndex ? 0 : -1}
                                  aria-label="최근 사용한 이모티콘 더보기"
                                  {...{ [FOCUS_INDEX_ATTRIBUTE]: recentsSliceCount }}
                                  onClick={(event) => {
                                    takeFocus(event);
                                    setRecentsVisibleRows((r) => r + 3);
                                  }}
                                >
                                  <span className="leading-tight">더보기</span>
                                  <ChevronDown className="-mt-1 size-6" strokeWidth={1.5} />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                      <section>
                        <h2 className="pb-xs text-body-sm text-meta">즐겨찾기</h2>
                        {favorites.length === 0 ? (
                          <EmptyState
                            className="border-0 bg-transparent"
                            Icon={Smile}
                            description="즐겨찾기한 이모티콘이 여기에 보여요"
                          />
                        ) : (
                          // WARN: § 8.14. Favorites are indexed right after the recents slice — offset by `recentsSlice.length` so arrows move seamlessly between the two sections.
                          <div
                            className="grid grid-cols-4 gap-2xs"
                            role="group"
                            aria-label="즐겨찾기한 이모티콘"
                          >
                            {favorites.map((item, i) => {
                              const index = recentsSectionCount + i;
                              return (
                                <EmoticonCell
                                  key={item.id}
                                  className="flex"
                                  buttonClassName="aspect-square w-full"
                                  item={item}
                                  index={index}
                                  isFocusable={index === focusableIndex}
                                  isWarmed
                                  eagerCount={EAGER_CELL_ROWS * columns}
                                  isKeyboardDriven={isKeyboardDriven}
                                  isMini={false}
                                  onSelect={handleSelect}
                                />
                              );
                            })}
                          </div>
                        )}
                      </section>
                    </div>
                  )
                ) : shown.length === 0 ? (
                  <EmptyState
                    className="border-0 bg-transparent"
                    Icon={Smile}
                    description={toGridEmptyMessage()}
                  />
                ) : (
                  // INFO: DESIGN.md § 9. Assets are user-authored, so their aspect ratios are arbitrary — the cell is a fixed square and the picture is `object-contain` inside it.
                  // WARN: § 8.14. The column count is `columns` as well as this class, and the two MUST agree — the vertical arrows step by that number, and a grid drawn at a different width moves focus to the wrong row. Both spellings are literals because Tailwind reads literals.
                  // INFO: § 8.14. `group` and not `grid`. ARIA's grid role requires `row` elements this layout has nowhere to put — a `display: contents` wrapper is the only place, and that is the property browsers spent years dropping from the accessibility tree. The **keys** follow the grid pattern; the roles say what is true, which is a labelled group of buttons.
                  <div
                    className={cn(
                      "grid gap-2xs",
                      menuKind === "mini" ? "grid-cols-6" : "grid-cols-4",
                    )}
                    role="group"
                    aria-label={kindNouns.kind}
                  >
                    {shown.map((item, index) => (
                      <EmoticonCell
                        key={item.id}
                        className="flex"
                        buttonClassName="aspect-square w-full"
                        item={item}
                        index={index}
                        isFocusable={index === focusableIndex}
                        isWarmed
                        eagerCount={EAGER_CELL_ROWS * columns}
                        isKeyboardDriven={isKeyboardDriven}
                        isMini={menuKind === "mini"}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
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

    // INFO: § 13.6. Either menu's 최근 사용 — the stored id list is one, and `recents` is already cut to this menu's kind.
    if (isRecentsTabId(activeTab)) {
      return menuKind === "mini" ? recents : [...recents, ...favorites];
    }

    return activePackItems;
  }

  function getEmoticonAtIndex(index: number): Optional<Emoticon> {
    if (isRecentsTabId(activeTab) && menuKind !== "mini") {
      if (index < recentsSliceCount) {
        return recents[index];
      }
      if (hasMoreRecents && index === recentsSliceCount) {
        return undefined;
      }
      const favoriteIndex = index - recentsSectionCount;

      return favorites[favoriteIndex];
    }

    return shown[index];
  }

  /**
   * REQUIREMENTS.md § 13.6. Which menu a tab belongs to, which is the only place a menu
   * is ever decided — `activeMenu` is this applied to the open tab.
   *
   * WARN: `MINI_RECENTS_TAB` has to be tested before the pack branch and cannot be
   * folded into it — it is the one tab of the 미니 menu that names no pack, so a kind
   * looked up from `packTypes` would answer `undefined` and drop the reader back onto
   * 이모티콘 with their own 최근 사용 on screen.
   */
  function toMenuOf(id: string): EmoticonMenu {
    if (id === SEARCH_TAB) {
      return "search";
    }

    if (id === MINI_RECENTS_TAB) {
      return "mini";
    }

    return isPackTabId(id) && packTypes.get(id) === "mini" ? "mini" : "emoticon";
  }

  /**
   * INFO: § 13.6. What an empty grid says, which depends on why it is empty.
   *
   * WARN: A failed request is not an empty pack, and saying so was the bug. The items
   * behind both tabs are requests now, and `isPending` goes false on an error as
   * readily as on an answer — so the grid asserted `이 묶음에는 이모티콘이 없어요` over
   * a pack that had plenty and the user had no way to tell.
   */
  function toGridEmptyMessage(): string {
    const { kind, pack } = kindNouns;

    if (isRecentsTabId(activeTab)) {
      if (hasRecentsFailed) {
        return `${josa(kind, "을/를")} 불러오지 못했어요`;
      }

      // INFO: § 13.6. A menu with no packs at all says so instead, since 최근 사용 being empty is then the consequence rather than the thing to report — nothing has been sent because there is nothing to send.
      return menuPacks.length === 0
        ? `추가한 ${josa(pack, "이/가")} 없어요`
        : `최근 사용한 ${josa(kind, "이/가")} 여기에 보여요`;
    }

    return hasPackFailed
      ? `${josa(kind, "을/를")} 불러오지 못했어요`
      : `이 묶음에는 ${josa(kind, "이/가")} 없어요`;
  }

  /**
   * INFO: REQUIREMENTS.md § 13.6. The second tap of a double tap sends what the first one staged.
   *
   * WARN: Counted off `click` rather than `dblclick`, which never arrives on touch — `HapticTap` takes the tap on its overlay and replays it as a scripted `control.click()`, and a scripted click starts no double-click sequence.
   *
   * @param pairExpires REQUIREMENTS.md § 8.14. False for the keyboard, which is one rule
   * with the thumb's and keeps no window: `DOUBLE_TAP_WINDOW` exists to tell a double tap
   * apart from two deliberate taps, and a key pressed twice on a cell focus never left is
   * already unambiguous — timed, the second `Enter` staged the item it had just staged.
   */
  function handleSelect(item: Emoticon, { pairExpires = true }: { pairExpires?: boolean } = {}) {
    // WARN: § 13. A mini is inserted rather than staged, on the pointer as well as the keyboard, and that is not a keyboard rule leaking. § 2.2. stores a mini as a fragment of a `text` message and never in `messages.emoticon_item_id`, so a staged one would promise a send with no row to land in.
    if (isMini(item)) {
      onInsert?.(item);

      return;
    }

    const lastTap = lastTapRef.current;
    const now = Date.now();

    if (lastTap?.id === item.id && (!pairExpires || now - lastTap.at < DOUBLE_TAP_WINDOW)) {
      // INFO: Cleared so a third tap opens a fresh pair rather than sending again off the second one.
      lastTapRef.current = null;
      onQuickSend(item);

      return;
    }

    lastTapRef.current = { id: item.id, at: now };
    onSelect(item);
  }

  /** REQUIREMENTS.md § 13. Which kind this item is, read off its pack — an item carries no kind of its own (§ 2.5.). */
  function isMini(item: Emoticon): boolean {
    return packTypes.get(item.packId) === "mini";
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
   * INFO: § 8.14. `⌃E` is not answered here, and used to be. It **toggles**, and what it
   * toggles — whether the panel is open — is the room's state, so a copy in here could
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
      // WARN: § 8.14. 이모티콘 and 미니 only, which narrows what this combination already did. 검색's second region is a field rather than a strip, so there is no tab beside the open one to turn to.
      isSearching ||
      // WARN: REQUIREMENTS.md § 8.14. What `⇧←/→` refuses to fire over, since `Shift` plus an arrow belongs to the field's own selection there — and it has to recognise a `contenteditable`, which is what the composer's field now is (§ 13.6.).
      isEditableElement(event.target)
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
        selectTab(tabIds[next]);
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
      if (
        isRecentsTabId(activeTab) &&
        menuKind !== "mini" &&
        hasMoreRecents &&
        index === recentsSliceCount
      ) {
        event.preventDefault();
        // INFO: § 8.14. Record the slot index before expanding so the useLayoutEffect below can focus the emoticon that fills it.
        pendingExpandFocusRef.current = recentsSliceCount;
        setRecentsVisibleRows((r) => r + 3);

        return;
      }

      const item = getEmoticonAtIndex(index);

      if (item) {
        activateCell(event, item);
      }

      return;
    }

    // WARN: § 8.14. The bare arrows only, and `isBareKey` rather than `!isCommandKey`. This guard asks "is this somebody else's chord", which is the **negative** of what `isCommandKey` answers — that one is an exact match, so it says no to `⌘⇧↓` and `⌥↓` and would have let both move a cell. ⌘↓ leaves the panel for the live edge, ⌥↓ scrolls the conversation, and `⌘⇧↓` extends a selection: none of them is this scroller's.
    if (!isBareKey(event)) {
      return;
    }

    const next = toNextFocusIndex(event.key, { index, count: gridItemCount, columns });

    if (next !== undefined) {
      event.preventDefault();
      focusItem(event.currentTarget, next);

      return;
    }

    // INFO: § 8.14. ↓ from 더보기 (always in the last column) when the same column has no item in the favorites row — jump to the first favorite instead, since the section starts at column 0 and a column-aligned step leaves it unreachable with 0–3 favorites.
    if (
      event.key === "ArrowDown" &&
      isRecentsTabId(activeTab) &&
      menuKind !== "mini" &&
      hasMoreRecents &&
      index === recentsSliceCount &&
      favorites.length > 0
    ) {
      event.preventDefault();
      focusItem(event.currentTarget, recentsSectionCount);

      return;
    }

    /**
     * INFO: § 8.14. Up off the **first row** is the way out of the cells, which is what
     * makes the whole panel reachable with the arrows alone. It used to be `↓` off the
     * last cell, and the third region is what inverted it: the strip sits above the grid
     * now, so reading the panel *upwards* is what arrives at it — 검색 to its own field,
     * every other menu to its strip.
     *
     * WARN: § 8.14. `↓` off the end therefore leads nowhere and is left unhandled. Handled anyway it would move focus **up** the screen, which is the one thing an arrow key must never do.
     */
    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (isSearching) {
        searchFieldRef.current?.focus();
      } else {
        focusActiveTab();
      }

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
      index: toCrossingIndex({ index, count: gridItemCount, columns, direction }),
      scrollTop,
    };
  }

  /**
   * REQUIREMENTS.md § 8.14. `↓` out of § 13.8.'s field and into what it filled — the
   * results row where the words found something, and the tabs where they did not, so
   * the key navigates on an empty search as readily as on a full one. `↑` is the way
   * back to the first region, which 검색 has no strip to reach it through.
   *
   * WARN: `isComposing` and the bare key only, through `isBareKey` rather than
   * `!isCommandKey`. A Hangul IME steers its candidate list with this key; ⌘↓ is the
   * room's jump to the live edge; ⌥↓ scrolls the conversation; and `⌘⇧↓` extends the
   * selection this field is holding — which `isCommandKey`, an exact match, says no to,
   * so asking it here would have taken that selection away.
   */
  function handleFieldKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (!isBareKey(event) || event.nativeEvent.isComposing) {
      return;
    }

    // INFO: § 8.14. What it costs is `↑`'s own meaning in a one-line field, which is the caret to offset 0 — `Home` still spells that, and without this the menu bar is reachable from below on every menu but the one the arrows most need it on.
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusActiveMenu();

      return;
    }

    if (event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();

    const row = cellScrollerRef.current;

    // WARN: § 8.14. The fallback is the **menu bar** now, and 검색 having no strip is why. The rule it answers is unchanged — a dead key on an empty search is exactly where the reader most needs to leave — but the only composite left below the field is the grid it just found nothing in.
    if (!row || !focusItem(row, Math.max(focusableIndex, 0))) {
      focusActiveMenu();
    }
  }

  /** REQUIREMENTS.md § 8.14. Into the strip from the grid below it. */
  function focusActiveTab() {
    const strip = tabStripRef.current;

    if (strip) {
      focusItem(strip, tabIds.indexOf(focusableTabId));
    }
  }

  /** REQUIREMENTS.md § 8.14. Into the menu bar, which is the top of the panel and the end of the way up. */
  function focusActiveMenu() {
    const bar = menuBarRef.current;

    if (bar) {
      // INFO: § 8.14. The focused chip and not the open one, so arriving from below lands where the bar's stop already is.
      focusItem(bar, EMOTICON_MENUS.indexOf(focusableMenu));
    }
  }

  /** REQUIREMENTS.md § 8.14. `ArrowDown` off the strip, into what the tab holds. */
  function focusTabContent() {
    enterTab({ index: 0 });
  }

  /**
   * REQUIREMENTS.md § 8.14. Puts focus where a `TabEntry` asked for it, and reports
   * whether it landed.
   *
   * INFO: § 8.14. The head of the list is where every way *in* lands — the `ArrowUp`
   * off the strip and the `⌃E` that opened the panel both pass `0`. Only a page turn
   * (`crossToAdjacentTab`) names a cell of its own, because that one is continuing a
   * row rather than starting a list.
   *
   * WARN: § 8.14. Clamped, which is what answers a pack shorter than the one turned
   * away from: the row `→` was on may not exist here, so focus takes the nearest cell
   * to it rather than nothing at all.
   */
  function enterTab(entry: TabEntry): boolean {
    const scroller = cellScrollerRef.current;

    if (scroller && gridItemCount > 0) {
      if (entry.scrollTop !== undefined) {
        scroller.scrollTop = entry.scrollTop;
      }

      return focusItem(scroller, Math.min(entry.index, gridItemCount - 1));
    }

    searchFieldRef.current?.focus();

    // INFO: § 8.14. A pack tab with nothing drawn yet has nowhere to put focus, and says so — the entry waits for its cells rather than settling for `<body>`.
    return isSearching;
  }

  /**
   * INFO: REQUIREMENTS.md § 8.14. `Enter`/`Space` is § 13.6.'s tap: once stages a
   * preview, and again on the same cell sends. `⌘Enter` is that send in one press, kept
   * because it is what every other app spells it with.
   *
   * WARN: The pair goes through `handleSelect`, so the keyboard and the thumb are one
   * rule rather than two — and `pairExpires` is what that one rule costs, since the
   * keyboard's half of it keeps no window (see there).
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

    // WARN: § 13. A mini has no staged form and therefore no quick send to skip to either, so `⌘Enter` on one is the same insertion the bare key makes — sent outright it would be a `messages.emoticon_item_id` § 2.2. never writes.
    if (isCommandKey(event) && !isMini(item)) {
      // WARN: § 13.6. The standing pair is cleared, or a press landing after this send would pair with one the send already spent.
      lastTapRef.current = null;
      onQuickSend(item);

      return;
    }

    handleSelect(item, { pairExpires: false });
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

    // WARN: § 8.14. The strip sits between the menu bar and the grid now, so both of its vertical keys lead somewhere — `↑` to the menu it belongs to, `↓` into the cells it just opened. It used to have only `↑`, back into a grid that was above it.
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusActiveMenu();

      return;
    }

    if (event.key === "ArrowDown") {
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
      // INFO: § 8.14. `→` off the last tab moves to the settings button at the end of the strip.
      if (event.key === "ArrowRight" && index === tabIds.length - 1) {
        event.preventDefault();
        settingsButtonRef.current?.focus();
      }

      return;
    }

    event.preventDefault();
    selectTab(tabIds[next]);
    focusItem(event.currentTarget, next);
  }

  /**
   * REQUIREMENTS.md § 8.14. `←` off 설정, back onto the strip's roving tab stop (or last tab) —
   * `→` off 설정 moves to 미니's 지우기 (if mini) —
   * and `↑`/`↓`, the same as the strip's own, since this button sits in that row.
   */
  function handleSettingsButtonKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !isBareKey(event)) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusActiveMenu();

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTabContent();

      return;
    }

    if (event.key === "ArrowLeft") {
      const strip = tabStripRef.current;

      if (!strip) {
        return;
      }

      event.preventDefault();
      focusItem(strip, tabIds.indexOf(focusableTabId));

      return;
    }

    if (event.key === "ArrowRight" && menuKind === "mini") {
      event.preventDefault();
      deleteButtonRef.current?.focus();
    }
  }

  /**
   * REQUIREMENTS.md § 8.14. `←` off 지우기, back onto 설정 (or strip's roving tab stop) —
   * and `↑`/`↓`, the same as the strip's own, since this button sits in that row.
   */
  function handleDeleteButtonKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !isBareKey(event)) {
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusActiveMenu();

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusTabContent();

      return;
    }

    if (event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    if (settingsButtonRef.current) {
      settingsButtonRef.current.focus();
    } else {
      const strip = tabStripRef.current;
      if (strip) {
        focusItem(strip, tabIds.indexOf(focusableTabId));
      }
    }
  }

  /**
   * REQUIREMENTS.md § 8.14. `←`/`→` walk the menu bar and open what they land on, and
   * `↓` goes into whatever that menu put in the region below.
   *
   * INFO: Automatic activation, for the strip's own reason — a menu is not a request of its own, and the panel already opens what an arrow lands on everywhere else.
   * WARN: § 8.14. No `↑`. The menu bar is the first region, so up is off the top of the panel — and moving focus to the composer from here would be a key that closes the panel underneath itself (§ 13.6.).
   */
  function handleMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !isBareKey(event)) {
      return;
    }

    // WARN: § 8.14. Into the **second** region and never the third, which is why this is not `focusTabContent`. 검색's second region is its field; `enterTab` prefers a cell and only falls through to the field when the grid is empty, so it would step over the field on every search that found something.
    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (isSearching) {
        searchFieldRef.current?.focus();
      } else {
        focusActiveTab();
      }

      return;
    }

    const index = readFocusIndex(event.target);

    if (index === undefined) {
      return;
    }

    // WARN: § 8.14. `Enter`/`Space` is what opens a menu here, and the arrows below deliberately do not — see `focusedMenu`. `Space` needs no repeat guard of its own, activating on `keyup`, but it does need this branch or the native click would arrive as a second activation.
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      const menu = EMOTICON_MENUS[index];

      if (menu === "search" && activeMenu !== "search") {
        skipSearchAutofocusRef.current = true;
        // WARN: § 8.14. `setTimeout` and not an effect. StrictMode runs a fresh mount's whole effect list — layout **and** passive — twice (setup, cleanup, setup) as one synchronous pass, so a passive effect clearing this flag still clears it before the *second* pass's layout effect gets to read it. A macrotask scheduled from here fires only once that whole synchronous double-mount has finished, so both passes see the flag exactly as this line left it.
        setTimeout(() => {
          skipSearchAutofocusRef.current = false;
        }, 0);
      }

      selectMenu(menu);

      return;
    }

    const next = toNextFocusIndex(event.key, {
      index,
      count: EMOTICON_MENUS.length,
      columns: 1,
    });

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    const nextMenu = EMOTICON_MENUS[next];
    setFocusedMenu(nextMenu);
    if (nextMenu !== activeMenu) {
      if (nextMenu === "search") {
        skipSearchAutofocusRef.current = true;
        setTimeout(() => {
          skipSearchAutofocusRef.current = false;
        }, 0);
      }
      selectMenu(nextMenu);
    }
    focusItem(event.currentTarget, next);
  }

  /**
   * REQUIREMENTS.md § 13.6. Opens a menu, which is to say opens a tab inside it.
   *
   * INFO: A menu holds no state of its own — `activeMenu` is derived from the open tab — so switching one is choosing which tab to open. It returns to the tab that menu was last left on, and to its 최근 사용 the first time.
   *
   * WARN: The remembered tab is checked against **this** render's pack list before it is
   * used. A pack disabled or deleted in § 13.5. while the panel was open is an id the
   * strip no longer draws, and `activeTab` would resolve it away to `RECENTS_TAB` — the
   * other menu's, since that fallback knows nothing about kinds.
   */
  function selectMenu(menu: EmoticonMenu) {
    if (menu === activeMenu) {
      return;
    }

    if (menu === "search") {
      selectTab(SEARCH_TAB);

      return;
    }

    const remembered = lastTabByKindRef.current[menu];
    const fallback = menu === "mini" ? MINI_RECENTS_TAB : RECENTS_TAB;
    const isStillThere =
      remembered !== null &&
      (isRecentsTabId(remembered) || visiblePacks.some((pack) => pack.id === remembered));

    selectTab(isStillThere ? remembered : fallback);
  }

  // INFO: § 13.9. Typing is the user taking the search over, so the item 따라하기 pinned to the front of the row stops being pinned.
  function changeQuery(next: string) {
    setQuery(next);
    setRevealed(null);
    // INFO: § 8.14. The row is a different list now, so the stop goes back to its head rather than to whatever the previous query happened to have at that offset.
    setFocusedIndex(0);
  }

  function selectTab(id: string) {
    // WARN: Not merely a wasted render — `setRequestedTab` writes `localStorage` and broadcasts to every hook instance and tab, on every tap of the pack that is already open.
    if (id === activeTab) {
      return;
    }

    setSlideFrom(toSlideDirection(id));
    setForcedTab(id === SEARCH_TAB ? SEARCH_TAB : null);
    // INFO: § 13.9. Walking to another tab ends the reveal — the ring belongs to the tap that asked for it, not to the panel.
    setRevealed(null);

    // WARN: § 13.8. The search tab is deliberately never remembered. It is a place the user passes through with a word in hand, so reopening the panel onto an empty search — days later, over the pack they actually use — would be answering a question nobody asked twice.
    if (id !== SEARCH_TAB) {
      // INFO: § 13.6. The within-session half of the memory, so a step across the menu bar and back returns to this tab rather than to 최근 사용 (`lastTabByKindRef`).
      lastTabByKindRef.current[toMenuOf(id) === "mini" ? "mini" : "emoticon"] = id;
      setRequestedTab(id);
    }
  }

  /**
   * INFO: § 13.6. Which side the arriving list slides in from — its place in this menu's
   * own strip, or the menu bar's order where the two menus differ.
   *
   * WARN: The menu comparison has to come first. A tab in another menu is in no `tabIds`
   * this render holds, so `indexOf` answers `-1` and every menu switch would slide in
   * from the left however the bar was walked.
   */
  function toSlideDirection(id: string): SwipeDirection {
    const menu = toMenuOf(id);

    if (menu !== activeMenu) {
      return EMOTICON_MENUS.indexOf(menu) < EMOTICON_MENUS.indexOf(activeMenu) ? -1 : 1;
    }

    return tabIds.indexOf(id) < activeIndex ? -1 : 1;
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
  /** REQUIREMENTS.md § 8.14. This cell's place in the list its scroller holds, which is what the arrow keys step through. */
  index: number;
  /** REQUIREMENTS.md § 8.14. Whether this is the one cell of the list in the tab sequence (ARIA's roving tabindex). */
  isFocusable: boolean;
  /**
   * § 13.6. Whether this list is one the warm covers, which decides how its images load.
   *
   * WARN: False for § 13.8.'s results row and that is not a detail. Nothing warms a search — `eager` there is up to twenty presigned fetches per answer for a row that shows about five, and the deferred skeleton is exactly what `PreloadFrameProps` documents it as being wrong for, since those cells really are being fetched.
   */
  isWarmed?: boolean;
  /** § 13.6. How many cells from the head load `eager` — `EAGER_CELL_ROWS` rows of whatever column count this list is drawn at. Ignored unless `isWarmed`. */
  eagerCount?: number;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what puts the ring on plain `:focus` (`CELL_KEYBOARD_RING`). */
  isKeyboardDriven: boolean;
  /** REQUIREMENTS.md § 13.9. Whether this is the cell 따라하기 named, which is ringed until the panel is taken somewhere else. */
  isRevealed?: boolean;
  /** REQUIREMENTS.md § 13. A mini draws its `animated-image` slot, not `still-image` — a mini is only ever played, never a frozen frame, so the grid shows exactly what a tap would insert. */
  isMini?: boolean;
  onSelect: (item: Emoticon) => void;
};

/** INFO: § 13.6. The grid and § 13.8.'s results draw the same cell — only the box around it differs. */
function EmoticonCell({
  className,
  buttonClassName,
  item,
  index,
  isFocusable,
  isWarmed = false,
  eagerCount = 0,
  isKeyboardDriven,
  isRevealed = false,
  isMini = false,
  onSelect,
}: EmoticonCellProps) {
  // WARN: § 13. A GIF/WebP/APNG's own loop count is not always infinite, so a mini cell fakes forever by remounting on a timer while it is actually on screen — `MINI_ANIMATION_LOOP_INTERVAL`. Not mini, the cell draws a still (below), which has nothing to replay — the hook is not wired to it at all.
  const { ref: replayRef, replayToken } = useViewportReplay(
    isMini ? MINI_ANIMATION_LOOP_INTERVAL : undefined,
  );
  const emoticonAssetUrl = toEmoticonAssetUrl(
    item.id,
    isMini ? "animated-image" : "still-image",
    item.version,
  );

  return (
    // WARN: `touch-pan-y` is repeated on the overlay rather than inherited — `touch-action` applies to the element the gesture starts on, and a cell tiles its scroller. The two are intersected (`DESIGN.md § 7.15.1.`), so a pair that disagreed would resolve to `none` and the panel would not scroll at all.
    // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the panel would stop scrolling (`DESIGN.md § 7.15.`).
    <HapticTarget className={className} overlayClassName="touch-pan-y" keepsScroll>
      {/* WARN: A press held on an emoticon is the start of the § 13.6. swipe, but to WebKit it is a long-press on an image — the callout it raises takes the pointer stream with it. */}
      <button
        ref={isMini ? replayRef : undefined}
        className={cn(
          "touch-pan-y",
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
          // WARN: Keyed by the replay token, and the token also rides the URL (`toReplaySrc`) — a mini's own loop count is not always infinite, and a fresh element alone does not restart one on iOS Safari (`useViewportReplay`).
          key={replayToken}
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          alt=""
          // WARN: The previous replay's own frame stands in while this one decodes — `toPreviousReplaySrc` — which is what keeps a replay remount from ever showing the skeleton at all, mini or not. `hidesPreviewOnReveal`, since an emoticon's own background is transparent — two frames stacked past the reveal double-expose into a ghost.
          previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
          hidesPreviewOnReveal
          // INFO: § 13.6. A warmed cell's skeleton is almost always a plate over an image that was ready — `PreloadFrameProps` carries the argument.
          hasDeferredSkeleton={isWarmed}
          // WARN: § 13. `lazy` on a replay remount is what caused the flicker below `EAGER_CELL_ROWS` — a freshly inserted lazy `<img>` re-runs the browser's own viewport check before it starts loading, which is slower than `PLACEHOLDER_DELAY` even for a cached asset. `replayToken > 0` only ever happens while the cell is in view (see `useViewportReplay`), so `eager` there is always correct.
          loading={(isWarmed && index < eagerCount) || replayToken > 0 ? "eager" : "lazy"}
          draggable={false}
          src={toReplaySrc(emoticonAssetUrl, replayToken)}
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
  /** REQUIREMENTS.md § 13. A search result's kind, read off its pack — an item carries no kind of its own (§ 2.5.), and a search row can mix both. */
  packTypes: Map<EmoticonPackId, EmoticonPackType>;
  /** REQUIREMENTS.md § 13.9. Whether the field has asked something the results do not yet answer. */
  isPending: boolean;
  /** REQUIREMENTS.md § 13.9.1. Whether what the field asked came back an error, which is neither pending nor a verdict. */
  hasFailed: boolean;
  /** REQUIREMENTS.md § 13.9. The item 따라하기 named, which is already first in `results`. */
  revealedId: Nullable<EmoticonItemId>;
  /** REQUIREMENTS.md § 13.9. The reveal this pane is showing, which the row is scrolled back to the head of — and the one way onto this tab that does not ask for the keyboard. */
  revealToken: Optional<number>;
  /** REQUIREMENTS.md § 8.14. Which cell of the row is the one in the tab sequence. */
  focusableIndex: number;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what paints the cells' focus ring. */
  isKeyboardDriven: boolean;
  /** REQUIREMENTS.md § 8.14. Held by the panel, which focuses it for ⌃E and for the row's `ArrowUp`. */
  fieldRef: RefObject<Nullable<HTMLInputElement>>;
  /** REQUIREMENTS.md § 8.14. Set by the panel when `Space`/`Enter` on the 검색 menu button opened this pane, so the mount effect below leaves focus on it instead. */
  skipAutofocusRef: RefObject<boolean>;
  /** REQUIREMENTS.md § 8.14. The row is also the scroller the panel moves cell focus inside, so the ref is the panel's rather than this pane's. */
  rowRef: RefObject<Nullable<HTMLDivElement>>;
  onQueryChange: (query: string) => void;
  onSelect: (item: Emoticon) => void;
  /** REQUIREMENTS.md § 8.14. `↓` out of the field, which the panel owns because where it lands depends on what the search found. */
  onFieldKeys: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCellKeys: (event: KeyboardEvent<HTMLDivElement>) => void;
  onCellFocus: (event: FocusEvent<HTMLDivElement>) => void;
};

/**
 * REQUIREMENTS.md § 13.8. The 검색 menu: the field in the second region, then the
 * results as a 4-column grid in the third.
 *
 * WARN: What pays for the keyboard exemption (§ 13.6.) is now
 * `--emoticon-search-panel-height` alone, and it is the only thing that does. This used
 * to be a single sideways row, on the argument that one row is short enough to share the
 * screen with the keys; the third region made it a grid like the other two menus, so the
 * height is where "fits in what the keyboard leaves" is stated — see that property.
 *
 * WARN: § 13.6.'s tab swipe is **not** attached here, and `keepAxisWhileScrollable` went
 * with it. Both existed because the results row scrolled along the swipe's own axis; the
 * grid scrolls vertically, and 검색 is a menu rather than a tab now, so there is no
 * neighbouring tab for a swipe to reach in the first place.
 */
function SearchPane({
  className,
  isOpen,
  query,
  results,
  packTypes,
  isPending,
  hasFailed,
  revealedId,
  revealToken,
  focusableIndex,
  isKeyboardDriven,
  fieldRef,
  rowRef,
  skipAutofocusRef,
  onQueryChange,
  onSelect,
  onFieldKeys,
  onCellKeys,
  onCellFocus,
}: SearchPaneProps) {
  const trimmed = query.trim();
  const emptyMessage = toEmptyMessage();

  /**
   * REQUIREMENTS.md § 8.14. Whether this `isOpen` session has already put focus
   * somewhere, so a result that only finishes loading after the mount still gets one
   * decision — never a second, later one that would steal focus back from typing.
   */
  const hasResolvedFocusRef = useRef(false);

  // INFO: § 13.8. Keyed on the panel rather than on this pane's mount, which covers only one of the two ways in — the picker never unmounts, so reopening onto 검색 is a prop change with no mount to hang a focus on.
  useLayoutEffect(() => {
    hasResolvedFocusRef.current = false;
  }, [isOpen]);

  // WARN: A layout effect and never the passive one. React flushes this inside the commit the tap renders, and WebKit raises the keyboard only for a `focus()` the user activation still covers — a frame later the field comes up focused with no keyboard, exactly as `message-search-bar.tsx` records.
  // WARN: § 13.9. And not when 따라하기 is what brought the tab up. Every other way onto this tab is a request to type; that one is a request to *look*, at an emoticon already sitting first in the row — raising the keyboard there puts the panel behind it and the thumb has further to travel than before the tap.
  // WARN: § 8.14. `Space`/`Enter` on 검색's own menu button sets `skipAutofocusRef` — and clears it back with a `setTimeout`, not an effect — just ahead of the mount this effect belongs to, so the reader's focus stays on the button that opened this pane instead of being pulled into the field. Marked resolved without focusing anything, so a fetch that later settles does not reopen the question.
  // WARN: § 13.8. A query that already has `results` is the same case as the reveal above by the same argument, and reaches here rather than the parent's `menuRequest` effect: the composer's preview toggle carries its match through `searchRequest`, not `menuRequest`, so this is the only place that request's mount is seen at all.
  // WARN: § 8.14. `isPending` held open rather than decided against on the first, empty-`results` render — the composer's preview tap seeds a query already known to match something, and a cold cache would otherwise read as "nothing found" for exactly as long as the fetch takes, focusing the field and raising a keyboard for a query the reader never asked to type.
  useLayoutEffect(() => {
    if (hasResolvedFocusRef.current || !isOpen || revealedId !== null) {
      return;
    }

    if (skipAutofocusRef.current) {
      hasResolvedFocusRef.current = true;

      return;
    }

    if (isPending) {
      return;
    }

    hasResolvedFocusRef.current = true;

    const scroller = rowRef.current;

    if (results.length > 0 && scroller) {
      focusItem(scroller, 0);
    } else {
      fieldRef.current?.focus();
    }
    // WARN: § 13.9. `revealedId` is deliberately not a dependency, for the reason given above it — it is cleared by a keystroke the field already has focus for. `results.length`, `rowRef`, `fieldRef` and `skipAutofocusRef` are read once `hasResolvedFocusRef` lets this branch run at all, which is the guard that makes the omission safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPending]);

  // WARN: § 13.9. Keyed on the token, not on the item — the grid keeps whatever offset a previous search left it at, so a second 따라하기 would put its emoticon at the head of a grid still scrolled somewhere else. Instant, for the reason § 13.6. gives against a smooth scroll while the strip is animating.
  // WARN: § 13.6. `top` now, where this was `left` while the results were one sideways row. A `scrollTo` naming the axis the scroller does not run on is a no-op, so the reveal silently stopped returning to the head of the list.
  // INFO: § 8.14. `rowRef` is listed because it is the panel's ref now rather than this pane's own, and a prop is a dependency the rule cannot see through. Its identity is stable, so it never re-runs on it.
  useLayoutEffect(() => {
    rowRef.current?.scrollTo({ top: 0 });
  }, [revealToken, rowRef]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2xs p-xs", className)}>
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
        <div className="flex flex-1 touch-pan-y items-center justify-center">
          {/* WARN: § 13.9.1. Nothing at all while the answer is in flight, where `toEmptyMessage` answers `""` — an icon standing over a blank line is the verdict this pane exists to withhold. */}
          {emptyMessage !== "" && (
            <EmptyState
              className="border-0 bg-transparent"
              Icon={Search}
              description={emptyMessage}
            />
          )}
        </div>
      ) : (
        <>
          {/* WARN: `overflow-x-hidden` keeps the § 13.6. slide inside the panel, as the other menus' scroller does — a vertical-only scroller still resolves its horizontal axis to `auto`. */}
          {/* WARN: `touch-pan-y` now, where this was `touch-pan-x` while the results were one sideways row. The scroller runs on the vertical axis like every other grid in the panel, so that is the axis the browser must keep. */}
          <div
            ref={rowRef}
            className="scrollbar-hidden min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
            onKeyDown={onCellKeys}
            onFocus={onCellFocus}
          >
            {/* WARN: § 8.14. Four columns, and `EMOTICON_GRID_COLUMNS` is the same decision — 검색 is drawn at 이모티콘's width rather than 미니's, whatever kind the results happen to hold, because a row of mixed kinds has no one width to be right at. */}
            <div className="grid grid-cols-4 gap-2xs" role="group" aria-label="검색 결과">
              {results.map((item, index) => (
                <EmoticonCell
                  key={item.id}
                  className="flex"
                  buttonClassName="aspect-square w-full"
                  item={item}
                  index={index}
                  isFocusable={index === focusableIndex}
                  isKeyboardDriven={isKeyboardDriven}
                  isRevealed={item.id === revealedId}
                  isMini={packTypes.get(item.packId) === "mini"}
                  onSelect={onSelect}
                />
              ))}
            </div>
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
}

type MenuSegmentProps = PropsWithChildren<{
  className?: string;
  /** REQUIREMENTS.md § 8.14. This menu's place in `EMOTICON_MENUS`, which the bar's arrow keys step through. */
  index: number;
  isSelected: boolean;
  /** REQUIREMENTS.md § 8.14. Whether this is the bar's one tab stop (ARIA's roving tabindex). */
  isFocusable: boolean;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what puts the ring on plain `:focus` (`MENU_KEYBOARD_RING`). */
  isKeyboardDriven: boolean;
  onClick: () => void;
}>;

/**
 * REQUIREMENTS.md § 13.6. One segment of the first region's track, sized by its own label,
 * with the selected one wearing a raised pill inside it.
 *
 * INFO: DESIGN.md § 7.1. It keeps `chip`'s 14px padding but not its 36 height — trimmed to 24
 * so the track leaves more of the panel to the grid below it.
 */
function MenuSegment({
  className,
  index,
  isSelected,
  isFocusable,
  isKeyboardDriven,
  children,
  onClick,
}: MenuSegmentProps) {
  return (
    // WARN: DESIGN.md § 7.15.3. `isTicking` and never a gate on the wrapper, exactly as `TabButton` records — the selection lands synchronously, so unmounting the wrapper on it loses the tick on the very tap that earned it.
    <HapticTarget className={cn("flex h-6 shrink-0", className)} isTicking={!isSelected}>
      <button
        className="group/menu flex h-full w-full cursor-pointer items-center justify-center outline-none"
        type="button"
        tabIndex={isFocusable ? 0 : -1}
        aria-pressed={isSelected}
        {...{ [FOCUS_INDEX_ATTRIBUTE]: index }}
        onClick={(event) => {
          takeFocus(event);
          onClick();
        }}
      >
        {/* WARN: The pointer states are read off the **target** (`/menu`) rather than off this box, since the two are the same size only while the segment is selected. The unnamed `group-active:` beside them is `HapticTarget`'s replay, which is a different ancestor. */}
        <span
          className={cn(
            // INFO: DESIGN.md § 7.1. `chip`'s own 14px horizontal padding, which is what gives each segment its width — they are sized by their labels rather than by an equal share of the track.
            "flex h-full w-full items-center justify-center rounded-full px-3.5 text-button-sm whitespace-nowrap transition-colors",
            MENU_FOCUS_RING,
            isKeyboardDriven && MENU_KEYBOARD_RING,
            // INFO: DESIGN.md § 5.3. The raised surface **and** `shadow-raised`, which is one lift written twice on purpose — the shadow is dropped on dark (`theme.css`), where the surface ladder is the whole of elevation.
            // INFO: DESIGN.md § 7.1. The selected segment takes no hover: selection is a state, not a hover target.
            isSelected
              ? "bg-surface-raised font-semibold text-ink shadow-raised"
              : "text-meta group-hover/menu:text-body group-active:text-body group-active/menu:text-body",
          )}
        >
          {children}
        </span>
      </button>
    </HapticTarget>
  );
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
