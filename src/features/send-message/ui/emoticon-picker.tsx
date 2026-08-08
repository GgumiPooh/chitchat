"use client";

import type { Emoticon, EmoticonPackWithItems } from "@/entities/emoticon";
import {
  matchesKeywordQuery,
  MAX_KEYWORD_QUERY_LENGTH,
  splitKeywordQuery,
  toEmoticonAssetUrl,
} from "@/shared/config";
import { A_SECOND, cn, type Nullable, type Optional } from "@/shared/lib";
import { EmptyState, HapticTarget, Input, PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock, Search, Smile } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type PropsWithChildren,
  type Ref,
} from "react";
import { useStorageState } from "synced-storage/react";
import { toEmoticonPacksQuery } from "../model/packs-query";
import { useHorizontalSwipe, type SwipeDirection } from "../model/use-horizontal-swipe";
import { useRecentEmoticons } from "../model/use-recent-emoticons";

// INFO: DESIGN.md § 9. Assets are user-authored, so their aspect ratios are arbitrary — the cell is a fixed square and the still is `object-contain` inside it.
const RECENTS_TAB = "recents";

// INFO: REQUIREMENTS.md § 13.8. Where a tap on the composer's underlined word lands, and the one tab reachable without the panel already being open.
const SEARCH_TAB = "search";

const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

// INFO: A sliver of the neighbouring tab stays visible past the revealed one, so the strip still reads as scrollable where it stops.
const TAB_REVEAL_MARGIN = 8;

// INFO: REQUIREMENTS.md § 13.6. Two taps on the same cell inside this window are the shortcut past the preview.
const DOUBLE_TAP_WINDOW = A_SECOND / 3;

// WARN: Hoisted so the pending query answers the same array every render — an inline `= []` mints a new identity, and the effect keyed on `packs` then re-runs its two `getBoundingClientRect` reads on every frame of the § 13.6. open animation.
const NO_PACKS: EmoticonPackWithItems[] = [];

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

  // WARN: § 13.8. Adjusted during render rather than in an effect. An effect lands a frame later, so the panel would open on the remembered tab, paint a grid of the wrong pack, and only then swap to the search row — which reads as the wrong panel flashing up. It is also why the forced tab is component state rather than the stored one: writing `localStorage` during a render is a side effect, and comparing tokens is not.
  if (searchRequest && searchRequest.token !== appliedSearchToken) {
    setAppliedSearchToken(searchRequest.token);
    setQuery(searchRequest.query);
    setForcedTab(SEARCH_TAB);
    // WARN: § 13.9. A word tapped in the composer ends any standing 따라하기, as `selectTab` and typing do. The panel can be open on a revealed cell when that tap lands — left standing, the search pins and rings an emoticon its own query never matched, and `hasReveal` withholds the keyboard from a tap that is a request to type.
    setRevealed(null);
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
  const [slideFrom, setSlideFrom] = useState<SwipeDirection>(1);
  const lastTapRef = useRef<Nullable<{ at: number; id: string }>>(null);
  const swipeHandlers = useHorizontalSwipe(goToAdjacentTab);
  // WARN: § 13.6. Read only. `remember` belongs to the send, not to the tap — recording it here re-sorts 최근 사용 between the two taps of a double tap, moving the cell out from under the second one.
  const { recentIds } = useRecentEmoticons();
  // INFO: § 13.6. The same descriptor `useEmoticonPreload` warmed, so the panel opens on the cached list rather than on `isPending`.
  // WARN: § 13.8. Every pack, hidden ones included. Only the tabs and 최근 사용 are filtered — search reads the whole list, which is what makes an emoticon from a pack this user hid findable at all.
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
  }

  const revealedId = revealed?.id ?? null;

  // INFO: The remembered pack can be gone or hidden (§ 13.1.) by the time the panel reopens, so it only holds while the loaded list still has it.
  const activeTab =
    requestedTab === RECENTS_TAB ||
    requestedTab === SEARCH_TAB ||
    isPending ||
    findPack(visiblePacks, requestedTab)
      ? requestedTab
      : RECENTS_TAB;
  const isSearching = activeTab === SEARCH_TAB;

  const byId = new Map(packs.flatMap((pack) => pack.items.map((item) => [item.id, item] as const)));
  // INFO: § 13.1. 최근 사용 is a tab like any other, so hiding a pack takes its items out of this list too — an emoticon sent through § 13.9. from a hidden pack is remembered and simply not drawn here.
  const visiblePackIds = new Set(visiblePacks.map((pack) => pack.id));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((item): item is Emoticon => item !== undefined && visiblePackIds.has(item.packId));
  const shown = toShownItems();
  const tabIds = [SEARCH_TAB, RECENTS_TAB, ...visiblePacks.map((pack) => pack.id)];
  const activeIndex = tabIds.indexOf(activeTab);

  // INFO: § 13.6. The swipe moves the tab without the finger ever touching the strip, and the remembered tab can reopen the panel on a pack that is already past its right edge — either way the strip has to follow the selection or the active tab is unreachable to the eye.
  useEffect(revealActiveTab, [activeTab, packs]);

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
    >
      {isSearching ? (
        <SearchPane
          isOpen={isOpen}
          query={query}
          results={shown}
          revealedId={revealedId}
          revealToken={appliedRevealToken}
          onQueryChange={changeQuery}
          onSelect={handleSelect}
          onSwipe={goToAdjacentTab}
        />
      ) : (
        // WARN: `overflow-x-hidden` is what keeps the § 13.6. slide inside the panel — a vertical-only scroller still resolves its horizontal axis to `auto`.
        // WARN: `touch-pan-y` leaves the vertical scroll native while denying the browser the horizontal axis, which it would otherwise consume before the § 13.6. swipe ever sees it.
        <div
          className="scrollbar-hidden min-h-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-xs"
          {...swipeHandlers}
        >
          {isPending ? null : (
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
                  description={
                    activeTab === RECENTS_TAB
                      ? "최근 사용한 이모티콘이 여기에 보여요"
                      : "이 그룹에는 이모티콘이 없어요"
                  }
                />
              ) : (
                <div className="grid grid-cols-4 gap-2xs">
                  {shown.map((item) => (
                    <EmoticonCell
                      key={item.id}
                      className="flex"
                      buttonClassName="aspect-square w-full"
                      item={item}
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
      <div
        ref={tabStripRef}
        className="scrollbar-hidden flex shrink-0 gap-2xs overflow-x-auto border-t border-hairline-soft p-2xs"
      >
        {/* INFO: § 13.8. First, so a swipe left from 최근 사용 reaches it and the tap target sits where the thumb starts. */}
        <TabButton
          ref={isSearching ? activeTabRef : undefined}
          isActive={isSearching}
          label="이모티콘 검색"
          onClick={() => selectTab(SEARCH_TAB)}
        >
          <Search className="size-5 text-meta" strokeWidth={1.75} />
        </TabButton>
        <TabButton
          ref={activeTab === RECENTS_TAB ? activeTabRef : undefined}
          isActive={activeTab === RECENTS_TAB}
          label="최근 사용"
          onClick={() => selectTab(RECENTS_TAB)}
        >
          <Clock className="size-5 text-meta" strokeWidth={1.75} />
        </TabButton>
        {packs.map((pack) => {
          const tabItem = toTabItem(pack);

          return (
            <TabButton
              key={pack.id}
              ref={activeTab === pack.id ? activeTabRef : undefined}
              isActive={activeTab === pack.id}
              label={pack.name}
              onClick={() => selectTab(pack.id)}
            >
              {tabItem ? (
                <PreloadImage
                  className="size-full"
                  imgClassName="size-full object-contain"
                  placeholderClassName="rounded-sm"
                  src={toEmoticonAssetUrl(tabItem.id, "image", tabItem.version)}
                  alt=""
                />
              ) : (
                <Smile className="size-5 text-meta" strokeWidth={1.75} />
              )}
            </TabButton>
          );
        })}
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
      // WARN: § 13.8. An empty field yields no terms, and that is what guards the blank query — `matchesKeywordQuery` prefix-matches and every keyword starts with `""`, so a query passed through unsplit would return the entire library rather than nothing.
      const terms = splitKeywordQuery(query);
      // WARN: § 13.8. `packs` and not `visiblePacks`. Searching is how an emoticon from a hidden pack is reached, and filtering here is what used to make § 13.9. undeliverable for exactly the item that needs it.
      const matches = packs.flatMap((pack) =>
        pack.items.filter((item) =>
          item.keywords.some((keyword) => terms.some((term) => matchesKeywordQuery(keyword, term))),
        ),
      );
      if (!revealed) {
        return matches;
      }

      /**
       * INFO: § 13.9. 따라하기 asks for the emoticons *related* to the one tapped,
       * and its keywords cannot be the only thing that answers: an item nobody has
       * described has none, and the row would then hold the tapped emoticon alone.
       * Its own pack is the relation that always exists, so the matches are followed
       * by its siblings.
       *
       * WARN: A `Map` for the order as much as for the dedupe — the tapped item
       * first whether or not it matches, then what the words found, then the rest of
       * its pack, and an item reached twice keeps the earlier place.
       */
      const related = new Map<string, Emoticon>([[revealed.id, revealed]]);

      for (const item of [...matches, ...(findPack(packs, revealed.packId)?.items ?? [])]) {
        if (!related.has(item.id)) {
          related.set(item.id, item);
        }
      }

      return [...related.values()];
    }

    if (activeTab === RECENTS_TAB) {
      return recents;
    }

    return findPack(visiblePacks, activeTab)?.items ?? [];
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
   */
  function revealActiveTab() {
    const strip = tabStripRef.current;
    const tab = activeTabRef.current;

    if (!strip || !tab) {
      return;
    }

    const stripBox = strip.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const clippedLeft = stripBox.left + TAB_REVEAL_MARGIN - tabBox.left;
    const clippedRight = tabBox.right + TAB_REVEAL_MARGIN - stripBox.right;

    if (clippedLeft <= 0 && clippedRight <= 0) {
      return;
    }

    strip.scrollBy({ left: clippedLeft > 0 ? -clippedLeft : clippedRight, behavior: "smooth" });
  }

  // INFO: § 13.9. Typing is the user taking the search over, so the item 따라하기 pinned to the front of the row stops being pinned.
  function changeQuery(next: string) {
    setQuery(next);
    setRevealed(null);
  }

  function selectTab(id: string) {
    // WARN: Not merely a wasted render — `setRequestedTab` writes `localStorage` and broadcasts to every hook instance and tab, on every tap of the pack that is already open.
    if (id === activeTab) {
      return;
    }

    setSlideFrom(tabIds.indexOf(id) < activeIndex ? -1 : 1);
    setForcedTab(id === SEARCH_TAB ? SEARCH_TAB : null);
    // INFO: § 13.9. Walking to another tab ends the reveal — the ring belongs to the tap that asked for it, not to the panel.
    setRevealed(null);

    // WARN: § 13.8. The search tab is deliberately never remembered. It is a place the user passes through with a word in hand, so reopening the panel onto an empty search — days later, over the pack they actually use — would be answering a question nobody asked twice.
    if (id !== SEARCH_TAB) {
      setRequestedTab(id);
    }
  }

  // INFO: REQUIREMENTS.md § 13.6. The ends do not wrap — 최근 사용 and the last pack are where the gesture stops, so a swipe never rotates past what the tabs show.
  function goToAdjacentTab(direction: SwipeDirection) {
    // WARN: The remembered tab survives the pending state (see `activeTab`) while `tabIds` does not, so until the packs land it is in no list and every neighbour of it is the wrong one.
    if (activeIndex < 0) {
      return;
    }

    const next = tabIds[activeIndex + direction];

    if (next) {
      selectTab(next);
    }
  }
}

type EmoticonCellProps = {
  className?: string;
  buttonClassName?: string;
  item: Emoticon;
  /** REQUIREMENTS.md § 13.9. Whether this is the cell 따라하기 named, which is ringed until the panel is taken somewhere else. */
  isRevealed?: boolean;
  onSelect: (item: Emoticon) => void;
};

/** INFO: § 13.6. The grid and § 13.8.'s row draw the same cell — only the box around it differs. */
function EmoticonCell({
  className,
  buttonClassName,
  item,
  isRevealed = false,
  onSelect,
}: EmoticonCellProps) {
  return (
    // WARN: `touch-pan-y` is repeated on the overlay, not inherited — `touch-action` applies to the element a gesture starts on, and the overlay is now that element.
    // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the panel would stop scrolling (`DESIGN.md § 7.15.`).
    <HapticTarget className={className} overlayClassName="touch-pan-y" keepsScroll>
      {/* WARN: A press held on an emoticon is the start of the § 13.6. swipe, but to WebKit it is a long-press on an image — the callout it raises takes the pointer stream with it. */}
      <button
        className={cn(
          "touch-pan-y rounded-sm p-2xs transition-colors select-none [-webkit-touch-callout:none] group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
          // INFO: § 13.9. A ring rather than the tabs' `bg-primary-tint` fill, which in this panel means "selected" — this cell is not selected, it is the one the tap was about.
          // WARN: § 13.9. `ring-inset`, or § 13.8.'s results row clips it. That row is `overflow-y-hidden` and its cells fill its height exactly, so an outset ring loses its top and bottom edges and reads as a broken box.
          isRevealed && "ring-2 ring-primary ring-inset",
          buttonClassName,
        )}
        type="button"
        aria-label="이모티콘"
        onClick={() => onSelect(item)}
      >
        <PreloadImage
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          src={toEmoticonAssetUrl(item.id, "image", item.version)}
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
  /** REQUIREMENTS.md § 13.9. The item 따라하기 named, which is already first in `results`. */
  revealedId: Nullable<string>;
  /** REQUIREMENTS.md § 13.9. The reveal this pane is showing, which the row is scrolled back to the head of — and the one way onto this tab that does not ask for the keyboard. */
  revealToken: Optional<number>;
  onQueryChange: (query: string) => void;
  onSelect: (item: Emoticon) => void;
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
  revealedId,
  revealToken,
  onQueryChange,
  onSelect,
  onSwipe,
}: SearchPaneProps) {
  const fieldRef = useRef<Nullable<HTMLInputElement>>(null);
  const rowRef = useRef<Nullable<HTMLDivElement>>(null);
  const swipeHandlers = useHorizontalSwipe(onSwipe);
  const trimmed = query.trim();

  // INFO: § 13.8. Keyed on the panel rather than on this pane's mount, which covers only one of the two ways in — the picker never unmounts, so reopening onto 검색 is a prop change with no mount to hang a focus on.
  // WARN: A layout effect and never the passive one. React flushes this inside the commit the tap renders, and WebKit raises the keyboard only for a `focus()` the user activation still covers — a frame later the field comes up focused with no keyboard, exactly as `message-search-bar.tsx` records.
  // WARN: § 13.9. And not when 따라하기 is what brought the tab up. Every other way onto this tab is a request to type; that one is a request to *look*, at an emoticon already sitting first in the row — raising the keyboard there puts the panel behind it and the thumb has further to travel than before the tap.
  useLayoutEffect(() => {
    if (isOpen && revealedId === null) {
      fieldRef.current?.focus();
    }
    // WARN: § 13.9. The reveal is deliberately not a dependency. It is cleared by the user typing, which is a keystroke the field already has focus for — listed here it would re-fire the focus on the frame the reveal is released and fight an IME mid-composition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // WARN: § 13.9. Keyed on the token, not on the item — the row keeps whatever offset a previous search left it at, so a second 따라하기 would put its emoticon at the head of a row still scrolled somewhere else. Instant, for the reason § 13.6. gives against a smooth scroll while the strip is animating.
  useLayoutEffect(() => {
    rowRef.current?.scrollTo({ left: 0 });
  }, [revealToken]);

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
        />
      </div>
      {results.length === 0 ? (
        // INFO: § 13.8. The whole pane below the field, and with no row to scroll it is where the tab swipe has the most room to be made.
        <p className="flex flex-1 touch-pan-y items-center justify-center text-body-sm text-meta">
          {trimmed === "" ? "단어를 입력해 보세요" : "찾는 이모티콘이 없어요"}
        </p>
      ) : (
        // WARN: `touch-pan-x` is the mirror of the grid's `touch-pan-y` — this scroller runs on the horizontal axis, so that is the one the browser must keep.
        <div
          ref={rowRef}
          className="scrollbar-hidden flex min-h-0 flex-1 touch-pan-x gap-2xs overflow-x-auto overflow-y-hidden overscroll-contain"
          onPointerDownCapture={keepAxisWhileScrollable}
        >
          {results.map((item) => (
            <EmoticonCell
              key={item.id}
              className="flex shrink-0"
              buttonClassName="size-(--emoticon-search-cell)"
              item={item}
              isRevealed={item.id === revealedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );

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
  isActive: boolean;
  label: string;
  onClick: () => void;
}>;

function TabButton({ ref, className, isActive, label, children, onClick }: TabButtonProps) {
  return (
    // INFO: A pack switch is a selection among peers, the same thing the tab bar ticks for.
    // WARN: DESIGN.md § 7.15.1. The tabs tile the strip they scroll, so the switch would claim every drag that starts on one and the strip would not move. No `overlayClassName` beside it, unlike the § 13.6. grid cells: this scroller is the horizontal one.
    // WARN: DESIGN.md § 7.15.3. Never gated on `isActive` here — the selection lands synchronously, so gating unmounts the label before its activation and the tick is lost on the very tap that earned it.
    <HapticTarget ref={ref} className={cn("inline-flex shrink-0", className)} keepsScroll>
      <button
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-md p-2xs transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
          isActive
            ? "bg-primary-tint"
            : "group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong",
        )}
        type="button"
        aria-label={label}
        aria-pressed={isActive}
        onClick={onClick}
      >
        {children}
      </button>
    </HapticTarget>
  );
}

/** INFO: REQUIREMENTS.md § 13.2. Null `thumbnail_item_id` falls back to the pack's first item. */
// INFO: The item itself rather than its id — the tab's asset URL needs its version too (§ 13.4.).
function toTabItem(pack: EmoticonPackWithItems): Nullable<Emoticon> {
  return pack.items.find((item) => item.id === pack.thumbnailItemId) ?? pack.items[0] ?? null;
}

function findPack(packs: EmoticonPackWithItems[], id: string) {
  return packs.find((pack) => pack.id === id);
}
