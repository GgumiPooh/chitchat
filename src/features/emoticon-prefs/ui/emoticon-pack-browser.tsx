"use client";

import { MAX_EMOTICON_PACK_NAME_LENGTH } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { EmptyState, Skeleton } from "@/shared/ui";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Search, Smile } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useInView } from "react-intersection-observer";
import { EMOTICON_PACK_ROW_HEIGHT } from "../model/pack-row-height";
import { usePackBrowse } from "../model/use-pack-browse";
import { EmoticonPackSearchRow } from "./emoticon-pack-search-row";

export type EmoticonPackBrowserProps = {
  className?: string;
  onOpenPack: (packId: string) => void;
  /** REQUIREMENTS.md § 13.5. A switch has been written, so the 사용중 tab's server seed is one edit out of date. */
  onEnabledChange: () => void;
};

/**
 * REQUIREMENTS.md § 13.5. The 이모티콘셋 검색 tab — the whole library, windowed,
 * with a switch per row and no reordering.
 *
 * INFO: The two tabs exist because those last two clauses cannot both be had in one
 * list: `SortableContext` needs the whole array, so a drag cannot cross a window that
 * has not been loaded. The list that reorders is the small whole one, and the list
 * that windows never reorders.
 */
export function EmoticonPackBrowser({
  className,
  onOpenPack,
  onEnabledChange,
}: EmoticonPackBrowserProps) {
  // WARN: Explicit, and it is not the bailout `useVirtualizer` gets for free. The React Compiler's list is keyed on that one name, and `useWindowVirtualizer` is not on it — compiled, this component memoizes `getVirtualItems` and stops re-windowing as the reader scrolls. `ArchiveGrid` carries the same line for the same reason.
  "use no memo";

  const [query, setQuery] = useState("");
  const { packs, isPending, isLoadingMore, hasFailed, loadMore, toggle } = usePackBrowse(
    query,
    onEnabledChange,
  );
  // WARN: The **sized container**, never this component's root — the field sits above it, and measuring an ancestor would put the whole window that far too high.
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: DESIGN.md § 3.3. The document is the scroller, so there is no element to capture — this is `documentElement`, and the `null` frame it yields on the server is what holds the skeleton up until the geometry has been measured.
  const scroller = useSyncExternalStore(subscribeToScroller, readScroller, readServerScroller);
  const [scrollMargin, setScrollMargin] = useState(0);
  // INFO: The sentinel sits a screen below the last row, so the next page is usually in hand before the reader reaches the bottom.
  const { ref: observeSentinel, inView } = useInView({ rootMargin: `${SENTINEL_REACH}px` });
  const sentinelRef = useRef<Nullable<HTMLDivElement>>(null);
  // WARN: `getItemKey` has to be one stable function — virtual-core memoizes its whole measurement pass on that identity — and it has to see *this* render's rows, so they are written to a ref during render rather than in an effect, which is a commit behind.
  const packsRef = useRef(packs);

  // eslint-disable-next-line react-hooks/refs -- the WARN above: the virtualizer reads `getItemKey` during render, so a layout effect lands a commit too late.
  packsRef.current = packs;

  const getItemKey = useCallback((index: number) => packsRef.current[index]?.id ?? index, []);
  // INFO: The observer needs the node and so does `isSentinelInReach`, and `useInView` hands back only a callback ref.
  const setSentinel = useCallback(
    (node: Nullable<HTMLDivElement>) => {
      sentinelRef.current = node;
      observeSentinel(node);
    },
    [observeSentinel],
  );
  // WARN: DESIGN.md § 3.3. The **window** virtualizer, because the document is what scrolls this screen. Pointed at the `(main)` slot instead it reads `scrollTop` off a plain flow container — permanently `0`, with an `offsetHeight` equal to the whole list — so the range comes back as every row and the windowing is silently off rather than visibly broken.
  const virtualizer = useWindowVirtualizer({
    count: packs.length,
    // INFO: Exact rather than an estimate, which is why nothing here is measured — `measureElement` would drag in the WebKit scroll-correction traps `ArchiveGrid` avoids for the same reason.
    estimateSize: () => EMOTICON_PACK_ROW_HEIGHT,
    getItemKey,
    // WARN: The list does not start at the top of the document — the header's clearance, the tab strip and the field are above it, and without this every row resolves that much too high.
    scrollMargin,
    overscan: OVERSCAN_ROWS,
  });

  useLayoutEffect(syncScrollMargin, [scroller, isPending]);

  // WARN: Attached once per scroller, so it holds that render's `syncScrollMargin` — safe only because everything that closure reads is either the `scroller` in this dependency list or a ref.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    const observer = new ResizeObserver(syncScrollMargin);

    observer.observe(scroller);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);

  // WARN: `isLoadingMore` is the dependency on purpose, and it is the right one rather than the row count. A page landing while the sentinel is still on screen has to ask for the next one, and `inView` does not change in that case — but neither does the length when a page arrives that deduplication empties, which stalls paging outright.
  // WARN: And `inView` alone is not enough to ask on, because that same landing re-runs this effect a frame or more before the observer has recomputed — so a stale `true` asks again, and the chain walks the whole library off one flick. The measurement below is what ends it; the flag only says a page may be due.
  useEffect(() => {
    if (inView && isSentinelInReach()) {
      loadMore();
    }
  }, [inView, isLoadingMore, loadMore]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* WARN: In flow, never `sticky`. Pinned it sat below a transparent app header with the rows passing between the two, and `DESIGN.md § 3.4.` rations what may leave the flow at all. */}
      <div className="px-md pb-xs">
        <div className="flex h-11 items-center gap-2xs rounded-full border border-hairline bg-surface-soft px-sm">
          <Search className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} aria-hidden />
          <input
            // WARN: `min-w-0` is what stops the field pushing the icon out of the pill — a flex item refuses by default to shrink below its content.
            className="min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none selection:bg-primary-tint placeholder:text-meta-soft"
            maxLength={MAX_EMOTICON_PACK_NAME_LENGTH}
            enterKeyHint="search"
            // WARN: Not `type="search"`. WebKit draws its own clear glyph inside such a field, which this pill has no room for and no style to match.
            type="text"
            value={query}
            placeholder="이모티콘 그룹 이름 검색"
            aria-label="이모티콘 그룹 이름 검색"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {renderList()}
    </div>
  );

  function renderList() {
    // WARN: The sentinel is deliberately absent from this branch. The skeleton is a screen's worth of rows at most, so one mounted alongside it is in view on every open and spends a page request before the first real row is drawn.
    if (scroller === null || isPending) {
      return (
        <div aria-hidden>
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-sm px-md py-xs">
              <Skeleton className="size-11 shrink-0 rounded-sm" />
              <Skeleton className="h-4 flex-1 rounded-xs" />
            </div>
          ))}
        </div>
      );
    }

    if (hasFailed) {
      return (
        <EmptyState className="m-md" Icon={Smile} description="이모티콘 그룹을 불러오지 못했어요" />
      );
    }

    if (packs.length === 0) {
      return (
        <EmptyState
          className="m-md"
          Icon={Smile}
          description={
            query.trim().length > 0 ? "검색 결과가 없어요" : "아직 이모티콘 그룹이 없어요"
          }
        />
      );
    }

    return (
      <>
        {/* INFO: `getTotalSize()` already nets off `scrollMargin`, so this is the rows' own height; the row offsets do not, hence the subtraction on each `translateY` below. */}
        <div
          ref={contentRef}
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const pack = packs[item.index];

            return (
              pack && (
                <div
                  key={item.key}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    height: item.size,
                    transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                  }}
                >
                  <EmoticonPackSearchRow pack={pack} onOpen={onOpenPack} onToggle={toggle} />
                </div>
              )
            );
          })}
        </div>
        <div ref={setSentinel} aria-hidden>
          {isLoadingMore && (
            <div className="flex items-center gap-sm px-md py-xs">
              <Skeleton className="size-11 shrink-0 rounded-sm" />
              <Skeleton className="h-4 flex-1 rounded-xs" />
            </div>
          )}
        </div>
      </>
    );
  }

  /**
   * INFO: Whether the sentinel is still within a screenful of the fold, measured now
   * rather than read off a flag the observer has not caught up to.
   *
   * WARN: The viewport's own height, not `documentElement`'s rect — the scroller here
   * is the document (`DESIGN.md § 3.3.`), whose box is the whole page rather than the
   * part of it on screen.
   */
  function isSentinelInReach() {
    const sentinel = sentinelRef.current;

    return (
      sentinel !== null &&
      sentinel.getBoundingClientRect().top - window.innerHeight <= SENTINEL_REACH
    );
  }

  /**
   * INFO: How far down the document the list starts — every row offset the virtualizer
   * computes is built on it.
   *
   * WARN: `window.scrollY` is added back, so this is the same number at every scroll
   * position. Left as the raw viewport rect it would fall by however far the reader has
   * scrolled, and the whole window would resolve one screenful too high.
   *
   * WARN: And rounded, because that sum is only invariant in exact arithmetic — a rect
   * snapped to a layout unit against a fractional `scrollY` jitters in the last bits,
   * and the identity guard below reads every jitter as a new geometry to render.
   */
  function syncScrollMargin() {
    const content = contentRef.current;

    if (!content || !scroller) {
      return;
    }

    const next = Math.round(content.getBoundingClientRect().top + window.scrollY);

    setScrollMargin((previous) => (previous === next ? previous : next));
  }
}

// INFO: DESIGN.md § 3.3. The document is the app's scroller and outlives every screen, so there is nothing to subscribe to.
const subscribeToScroller = () => () => {};
const readScroller = (): Nullable<HTMLElement> => document.documentElement;
const readServerScroller = (): Nullable<HTMLElement> => null;

// INFO: A row is 64px, so this is roughly two screens either side — enough that a fast flick never shows an empty band.
const OVERSCAN_ROWS = 12;

// INFO: One screenful of prefetch, and it is the observer's `rootMargin` and the re-ask's own measurement alike — two numbers here would page on one rule and stop on another.
const SENTINEL_REACH = 600;

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];
