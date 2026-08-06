"use client";

import type { Emoticon, EmoticonPackWithItems } from "@/entities/emoticon";
import { EMOTICON_PACKS_PATH, toEmoticonAssetUrl } from "@/shared/config";
import { A_SECOND, cn, type Nullable } from "@/shared/lib";
import { EmptyState, HapticTarget, PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { Clock, Smile } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren, type Ref } from "react";
import { useStorageState } from "synced-storage/react";
import { useHorizontalSwipe, type SwipeDirection } from "../model/use-horizontal-swipe";
import { useRecentEmoticons } from "../model/use-recent-emoticons";

// INFO: DESIGN.md § 9. Assets are user-authored, so their aspect ratios are arbitrary — the cell is a fixed square and the still is `object-contain` inside it.
const RECENTS_TAB = "recents";

const ACTIVE_TAB_KEY = "jandh:emoticon-tab";

// INFO: A sliver of the neighbouring tab stays visible past the revealed one, so the strip still reads as scrollable where it stops.
const TAB_REVEAL_MARGIN = 8;

// INFO: REQUIREMENTS.md § 13.6. Two taps on the same cell inside this window are the shortcut past the preview.
const DOUBLE_TAP_WINDOW = A_SECOND / 3;

export type EmoticonPickerProps = {
  className?: string;
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
export function EmoticonPicker({ className, onSelect, onQuickSend }: EmoticonPickerProps) {
  // WARN: Read straight from storage rather than seeded into `useState` — the panel can mount during hydration, where the first snapshot is still the fallback and a seeded state would never pick the stored tab up.
  const [storedTab, setRequestedTab] = useStorageState<string>(ACTIVE_TAB_KEY, RECENTS_TAB, {
    strategy: "localStorage",
  });
  const requestedTab = typeof storedTab === "string" ? storedTab : RECENTS_TAB;
  const tabStripRef = useRef<Nullable<HTMLDivElement>>(null);
  const activeTabRef = useRef<Nullable<HTMLSpanElement>>(null);
  const [slideFrom, setSlideFrom] = useState<SwipeDirection>(1);
  const lastTapRef = useRef<Nullable<{ at: number; id: string }>>(null);
  const swipeHandlers = useHorizontalSwipe(goToAdjacentTab);
  // WARN: § 13.6. Read only. `remember` belongs to the send, not to the tap — recording it here re-sorts 최근 사용 between the two taps of a double tap, moving the cell out from under the second one.
  const { recentIds } = useRecentEmoticons();
  const { data: packs = [], isPending } = useQuery({
    queryKey: ["emoticon-packs", "enabled"],
    queryFn: fetchEnabledPacks,
  });

  // INFO: The remembered pack can be gone or hidden (§ 13.1.) by the time the panel reopens, so it only holds while the loaded list still has it.
  const activeTab =
    requestedTab === RECENTS_TAB || isPending || findPack(packs, requestedTab)
      ? requestedTab
      : RECENTS_TAB;

  const byId = new Map(packs.flatMap((pack) => pack.items.map((item) => [item.id, item] as const)));
  const recents = recentIds
    .map((id) => byId.get(id))
    .filter((item): item is Emoticon => item !== undefined);
  const shown = activeTab === RECENTS_TAB ? recents : (findPack(packs, activeTab)?.items ?? []);
  const tabIds = [RECENTS_TAB, ...packs.map((pack) => pack.id)];
  const activeIndex = tabIds.indexOf(activeTab);

  // INFO: § 13.6. The swipe moves the tab without the finger ever touching the strip, and the remembered tab can reopen the panel on a pack that is already past its right edge — either way the strip has to follow the selection or the active tab is unreachable to the eye.
  useEffect(revealActiveTab, [activeTab, packs]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex h-(--emoticon-panel-height) flex-col rounded-lg border border-hairline bg-canvas",
        className,
      )}
    >
      {/* WARN: `overflow-x-hidden` is what keeps the § 13.6. slide inside the panel — a vertical-only scroller still resolves its horizontal axis to `auto`. */}
      {/* WARN: `touch-pan-y` leaves the vertical scroll native while denying the browser the horizontal axis, which it would otherwise consume before the § 13.6. swipe ever sees it. */}
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
                  // WARN: `touch-pan-y` is repeated on the overlay, not inherited — `touch-action` applies to the element a gesture starts on, and the overlay is now that element.
                  // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the panel would stop scrolling (`DESIGN.md § 7.15.`).
                  <HapticTarget
                    key={item.id}
                    className="flex"
                    overlayClassName="touch-pan-y"
                    keepsScroll
                  >
                    {/* WARN: A press held on an emoticon is the start of the § 13.6. swipe, but to WebKit it is a long-press on an image — the callout it raises takes the pointer stream with it. */}
                    <button
                      className="aspect-square w-full touch-pan-y rounded-sm p-2xs transition-colors select-none [-webkit-touch-callout:none] group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
                      type="button"
                      aria-label="이모티콘"
                      onClick={() => handleSelect(item)}
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
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* INFO: § 13.6. Pack tabs along the bottom, matching where the thumb already is. */}
      <div
        ref={tabStripRef}
        className="scrollbar-hidden flex shrink-0 gap-2xs overflow-x-auto border-t border-hairline-soft p-2xs"
      >
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

  function selectTab(id: string) {
    // WARN: Not merely a wasted render — `setRequestedTab` writes `localStorage` and broadcasts to every hook instance and tab, on every tap of the pack that is already open.
    if (id === activeTab) {
      return;
    }

    setSlideFrom(tabIds.indexOf(id) < activeIndex ? -1 : 1);
    setRequestedTab(id);
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
    <HapticTarget ref={ref} className={cn("inline-flex shrink-0", className)} isTicking={!isActive}>
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

async function fetchEnabledPacks(): Promise<EmoticonPackWithItems[]> {
  const response = await fetch(`${EMOTICON_PACKS_PATH}?enabled=1`);

  if (!response.ok) {
    throw new Error(`GET ${EMOTICON_PACKS_PATH} responded ${response.status}`);
  }

  const { packs } = (await response.json()) as { packs: EmoticonPackWithItems[] };

  return packs;
}
