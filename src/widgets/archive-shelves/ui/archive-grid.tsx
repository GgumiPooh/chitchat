"use client";

import type { ArchiveMedia } from "@/entities/media";
import { MESSAGE_FLASH_DURATION } from "@/shared/config";
import {
  cn,
  isSidePanelAnimating,
  onSidePanelSettled,
  useSettledCommit,
  type LongPressPoint,
  type Maybe,
  type MediaId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { Skeleton, toast, type MediaCell } from "@/shared/ui";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useInView } from "react-intersection-observer";
import { runColumnsTransition } from "../model/run-columns-transition";
import { toArchiveCells } from "../model/to-archive-cells";
import { toArchiveRows, type ArchiveGridRow } from "../model/to-archive-rows";
import { useArchiveSweep } from "../model/use-archive-sweep";
import type { ArchiveColumnCount } from "../model/use-pinch-columns";
import { usePinchColumns } from "../model/use-pinch-columns";
import { ArchiveTile, isTileOnScreen } from "./archive-tile";

export type ArchiveGridProps = {
  className?: string;
  media: ArchiveMedia[];
  /** AGENTS.md § 4.1. 1–7 at every width — the pinch's and the 열 개수 slider's shared cookie. */
  columns: ArchiveColumnCount;
  /** AGENTS.md § 4.1. The `lg` panel's month list — a token bump re-scrolls even when the same month is tapped twice. */
  jumpTo?: { monthKey: string; token: number };
  isLoadingMore: boolean;
  /** REQUIREMENTS.md § 10. A page newer than the window is in flight — the dependency that makes the upward sentinel re-ask, as `isLoadingMore` does downward. */
  isLoadingNewer: boolean;
  /** REQUIREMENTS.md § 10. A newer page is fetched and waiting for this scroller to go still. */
  hasHeldNewer: boolean;
  isSelecting: boolean;
  selected: Set<string>;
  /** REQUIREMENTS.md § 10. The tile the shelf was opened on, from `?target=` — consumed once at mount, never re-applied. */
  targetId?: MediaId;
  /**
   * DESIGN.md § 4.7.3. The slide the open viewer is on, so the shelf keeps a
   * landing for its closing morph — acted on only when that tile is not already
   * on screen, and repeats (no flash) since it tracks a moving position rather
   * than a one-time destination.
   */
  revealId?: MediaId;
  /** AGENTS.md § 4.1. Pinch-driven — omitted wherever the caller has no column state to change (there is none). */
  onColumnsChange?: (columns: ArchiveColumnCount) => void;
  /**
   * The whole ordered cell list and the tapped index, so the viewer can swipe
   * past the month it started in. DESIGN.md § 4.7.3.: `origin` is the tile's own
   * square, which the viewer's opening morph expands out of.
   */
  onOpen: (cells: MediaCell[], index: number, origin: HTMLElement) => void;
  onToggle: (id: string) => void;
  /** REQUIREMENTS.md § 10. Holding a tile picks it and anchors the sweep, entering selection mode if it is not on yet; omitted while selection is unavailable. */
  onSweepStart?: (id: string) => void;
  /** REQUIREMENTS.md § 10. Every id from the held tile to the one under the finger, in grid order — the range, not the tile that changed. */
  onSweepTo: (ids: string[]) => void;
  onLoadMore: () => void;
  /** REQUIREMENTS.md § 10. Asks for the page above the window; the hook holds it rather than committing it. */
  onLoadNewer: () => void;
  /** REQUIREMENTS.md § 10. Commits the held page. Called only from this component, because only it knows when its scroller has gone still. */
  onInsertNewer: () => void;
};

/**
 * DESIGN.md § 7.10. The reverse-chronological grid with month section headers,
 * windowed with `@tanstack/react-virtual` (REQUIREMENTS.md § 8.3.). One virtual
 * row is a line of tiles or a month label — never a single tile — so a header
 * scrolls with the grid instead of floating over it. Nothing here is measured:
 * a line's height is arithmetic on the grid's own width, so `estimateSize` is
 * exact and § 8.3.'s measurement traps have nothing to act on.
 */
export function ArchiveGrid({
  className,
  media,
  columns,
  jumpTo,
  isLoadingMore,
  isLoadingNewer,
  hasHeldNewer,
  isSelecting,
  selected,
  targetId,
  revealId,
  onColumnsChange,
  onOpen,
  onToggle,
  onSweepStart,
  onSweepTo,
  onLoadMore,
  onLoadNewer,
  onInsertNewer,
}: ArchiveGridProps) {
  // WARN: React Compiler's memoization skip list is keyed on `useVirtualizer`, not `useWindowVirtualizer` — without this, it would memoize `getVirtualItems` and stop re-windowing on scroll.
  "use no memo";

  const startSweep = useArchiveSweep({
    onEnter: sweepTo,
    onEnd: () => {
      anchorRef.current = null;
    },
  });
  // WARN: The sized container, not the grid's root — the upward sentinel sits between them, and every row offset is resolved from this element's top.
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: DESIGN.md § 3.3. `documentElement`, held only so `useSettledCommit` can tell a document scroller from an element one by identity; the `null` server snapshot also holds the skeleton up until geometry is measured.
  const scroller = useSyncExternalStore(subscribeToScroller, readScroller, readServerScroller);
  const [geometry, setGeometry] = useState(INITIAL_GEOMETRY);
  const rows = useMemo(() => toArchiveRows(media, columns), [media, columns]);
  const cells = useMemo(() => toArchiveCells(media), [media]);
  const indexById = useMemo(() => new Map(cells.map((cell, i) => [cell.id, i])), [cells]);
  // INFO: DESIGN.md § 7.8. Where the last line stopped — a page is cut into months and each month into its own lines, so that line is nearly always short, and a skeleton row starting below it leaves the hole visible.
  const trailingGap = toTrailingGap(rows, columns);
  // INFO: DESIGN.md § 7.8. The hole plus a full line under it, so a page in flight reads as more shelf coming rather than as one short row.
  const skeletonCount = trailingGap > 0 ? columns * 2 - trailingGap : columns;
  const anchorRef = useRef<Nullable<number>>(null);
  const pinchColumns = usePinchColumns({
    columns,
    onColumnsChange: (next) => {
      if (!onColumnsChange) {
        return;
      }

      // INFO: AGENTS.md § 4.1. Named before the state commits, released once the reflow has painted — a pinch step reads as the grid's own tiles resizing rather than a cut to a new layout.
      runColumnsTransition(() => onColumnsChange(next));
    },
  });
  // INFO: REQUIREMENTS.md § 10. Where the reader was, and how tall the list was, at the moment a held page was committed — the two numbers the scroll correction below is the difference of.
  const correctionRef = useRef<Nullable<{ top: number; total: number }>>(null);
  // INFO: DESIGN.md § 6.8. The tile a § 10. jump landed on, until its flash expires.
  const [flashingId, setFlashingId] = useState<Nullable<string>>(null);
  // INFO: The sentinel sits a screen below the last row, so the next page is usually in hand before the user reaches the bottom.
  const { ref: sentinelRef, inView } = useInView({ rootMargin: "600px" });
  // INFO: REQUIREMENTS.md § 10. Its mirror above the window, which only a § 10. jump can ever reach — a shelf opened from the newest has nothing over it and `loadNewer` answers that in one branch.
  const { ref: topSentinelRef, inView: isTopInView } = useInView({ rootMargin: "600px" });
  // WARN: REQUIREMENTS.md § 8.3. `getItemKey` must be one stable function — virtual-core memoizes the whole measurement pass on its identity — so rows are written to a ref during render rather than in an effect, which is a commit behind.
  const rowsRef = useRef(rows);
  // INFO: AGENTS.md § 4.1. The tile a column change is about to leave under the reader — whichever of the pinch and the 열 개수 slider moved `columns`, since the slider lives outside this tree and cannot say so itself.
  // WARN: Read during render, before `rowsRef` takes the new rows — the old rows and the old `geometry` are the only layout the current scroll position means anything against.
  const columnsAnchorRef = useRef<Nullable<MediaId>>(null);
  const columnsRef = useRef(columns);
  // INFO: AGENTS.md § 4.4. Guards `syncGeometry`'s deferral against the `lg` side panel — set while a settle callback is pending, so the animation's per-frame `ResizeObserver` firings register only one.
  const panelSettledUnsubscribeRef = useRef<Nullable<() => void>>(null);

  /* eslint-disable react-hooks/refs -- the WARN above: a layout effect sees only the new rows, and the previous render's virtual items already describe the next layout. */
  if (columnsRef.current !== columns) {
    columnsRef.current = columns;
    columnsAnchorRef.current = readTopVisibleCellId(rowsRef.current, cells, geometry);
  }
  /* eslint-enable react-hooks/refs */

  // eslint-disable-next-line react-hooks/refs -- the WARN above: the virtualizer reads `getItemKey` during render, so a layout effect lands a commit too late.
  rowsRef.current = rows;

  const getItemKey = useCallback((index: number) => rowsRef.current[index]?.key ?? index, []);
  // WARN: DESIGN.md § 3.3. The window virtualizer — the document is what scrolls this shelf; pointed at a plain flow container instead, `scrollTop` reads permanently `0` and windowing silently breaks.
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    // WARN: REQUIREMENTS.md § 8.3. Per row, never one flat guess — a month label and a line of tiles are nothing like the same height.
    estimateSize: (index) => toRowHeight(rowsRef.current[index], index, geometry.tileSize),
    getItemKey,
    // WARN: The grid does not start at the top of the document — the floating header and § 7.10. chips sit above it.
    scrollMargin: geometry.scrollMargin,
    // WARN: REQUIREMENTS.md § 10. The sweep's drag hit-tests the document with `elementsFromPoint`, so a tile the edge auto-scroll is about to bring under the finger needs a node before it gets there.
    overscan: OVERSCAN_ROWS,
    // WARN: No `anchorTo`, where chat holds the end — a prepend here is an upload the reader just made (§ 10.), and anchoring would push their own new photo off the top.
  });

  // WARN: Not dependency-less — each run forces layout three times, and a sweep rewrites the selection on every tile crossed (§ 10.), so this must not fire on every render.
  // INFO: Triggers: § 7.10.'s chips unmounting in selection mode resizes the grid; a rotation/resize hits the `ResizeObserver` below; `columns` (AGENTS.md § 4.1.) changes how many tiles a row divides into.
  useLayoutEffect(syncGeometry, [scroller, isSelecting, columns]);

  // WARN: Attached once per scroller, holding that render's `syncGeometry` — safe only because the closure reads nothing but `scroller` and refs. Give it more to read and it needs re-attaching.
  // WARN: `columns` in particular must stay a ref read — fewer columns grows the document, which fires this with the mount-time count and shrank every row estimate under its tiles.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    const observer = new ResizeObserver(syncGeometry);

    observer.observe(scroller);

    return () => {
      observer.disconnect();
      panelSettledUnsubscribeRef.current?.();
      panelSettledUnsubscribeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);

  // WARN: `estimateSize` isn't one of virtual-core's own memoization inputs, so a tile-size change needs an explicit `measure()`.
  // WARN: Guarded on a ref, not `[geometry.tileSize, virtualizer]` — `virtualizer` is a new object every render ("use no memo" above), and re-measuring on every render created a scrollbar-flicker feedback loop through the `ResizeObserver` below.
  const measuredTileSizeRef = useRef(geometry.tileSize);

  useLayoutEffect(() => {
    if (measuredTileSizeRef.current === geometry.tileSize) {
      return;
    }

    measuredTileSizeRef.current = geometry.tileSize;
    virtualizer.measure();

    const anchorId = columnsAnchorRef.current;

    if (anchorId === null) {
      return;
    }

    // WARN: Restored here and not on `[columns]` — that commit still estimates rows at the old tile size, and a scroll asserted against it lands short by the whole growth of every row above the anchor.
    columnsAnchorRef.current = null;

    const index = findRowIndex(rowsRef.current, indexById.get(anchorId));

    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry.tileSize, virtualizer]);

  // WARN: `isLoadingMore`, not `media.length`, is the right dependency — a page that dedup empties leaves `media.length` unchanged and would stall paging; every finished load flips this and re-asks.
  useEffect(() => {
    if (inView) {
      onLoadMore();
    }
  }, [inView, isLoadingMore, onLoadMore]);

  // WARN: Keyed on `isLoadingNewer` — the fetch, not the insert — since the page is held after it lands (§ 10.); keying on the commit would leave the sentinel silent for the whole wait.
  useEffect(() => {
    if (isTopInView) {
      onLoadNewer();
    }
  }, [isTopInView, isLoadingNewer, onLoadNewer]);

  // WARN: REQUIREMENTS.md § 10. Memoized — `useSettledCommit` rebuilds its schedule from this identity, so an unmemoized function restarts the settle wait on every render, and a sweep re-renders on every tile crossed.
  // WARN: Guarded on `hasHeldNewer` — `useSettledCommit` reports every settle, not just page-driven ones (§ 8.3.), so an unrelated stop-scroll would otherwise arm a stale correction.
  const commitHeldNewer = useCallback(() => {
    if (!hasHeldNewer || !scroller) {
      return;
    }

    correctionRef.current = { top: window.scrollY, total: virtualizer.getTotalSize() };
    onInsertNewer();
  }, [hasHeldNewer, scroller, virtualizer, onInsertNewer]);

  // INFO: REQUIREMENTS.md § 8.3., § 10. Committed only once the scroller is still and untouched — inserting above moves every row below it, and the scroll correction is dropped mid-gesture.
  useSettledCommit({ scroller, isPending: hasHeldNewer, onSettled: commitHeldNewer });

  // WARN: REQUIREMENTS.md § 10. A total-size delta, not a keyed-row re-find (unlike chat, § 8.3.) — no row survives this prepend, since lines are re-cut from each month's start.
  // WARN: Safe only because nothing else corrects scroll here — no measured rows, no `anchorTo`; add either and the corrections compound (§ 8.3.).
  useLayoutEffect(() => {
    const correction = correctionRef.current;

    if (!correction || !scroller) {
      return;
    }

    correctionRef.current = null;
    // INFO: DESIGN.md § 3.3. The document's own scroll. A prepend does not move this shelf down the page, so `scrollMargin` is unchanged and the growth is entirely the list's — which makes the delta the whole correction.
    window.scrollTo(0, correction.top + (virtualizer.getTotalSize() - correction.total));
  });

  // INFO: REQUIREMENTS.md § 10. Taken once at mount — a URL is a destination, not a repeating instruction, exactly as 채팅's own `?message=` (§ 8.6.1.).
  // WARN: Two `requestAnimationFrame`s, not one — `ScrollMemory`'s own rAF restore (`scroll-memory.tsx`) would overwrite a jump asserted any earlier.
  useEffect(() => {
    if (!targetId) {
      return;
    }

    const index = findRowIndex(rowsRef.current, indexById.get(targetId));

    // INFO: § 8.6.1.'s vocabulary — the row is gone (a 삭제 since the link was drawn) or never was on the shelf; not an error.
    if (index === -1) {
      toast.error("사진을 찾지 못했어요");

      return;
    }

    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        virtualizer.scrollToIndex(index, { align: "center" });
        setFlashingId(targetId);
      });
    });

    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // INFO: DESIGN.md § 4.7.3. Brings the open viewer's slide back under the grid so the photo has somewhere to shrink into; the scroll is invisible behind the opaque viewer.
  // WARN: Guarded on the tile not already being on screen — re-centring a tile the reader can already see would move the grid for no reason they can name.
  // INFO: An unpaged row resolves to `-1` and is left alone — `endMediaMorph` reads that as a `dismiss`.
  useEffect(() => {
    if (!revealId || isTileOnScreen(revealId)) {
      return;
    }

    const index = findRowIndex(rowsRef.current, indexById.get(revealId));

    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealId]);

  // INFO: AGENTS.md § 4.1. The `lg` panel's month list — jumps to the row labeling the tapped month; `token` makes tapping the same month twice scroll twice, since the key otherwise never changes.
  useEffect(() => {
    if (!jumpTo) {
      return;
    }

    const index = rowsRef.current.findIndex(
      (row) => row.kind === "month" && row.key === `month:${jumpTo.monthKey}`,
    );

    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo]);

  // INFO: DESIGN.md § 6.8. The flash is a moment, not a selection — nothing dismisses it but time.
  useEffect(() => {
    if (flashingId === null) {
      return;
    }

    const timer = setTimeout(() => setFlashingId(null), MESSAGE_FLASH_DURATION);

    return () => clearTimeout(timer);
  }, [flashingId]);

  return (
    <div className={cn("flex flex-col", className)} {...pinchColumns}>
      {/* INFO: DESIGN.md § 7.8. Skeleton until the scroller is in hand (one layout effect away) — better than a blank frame the eye settles on and then loses. */}
      {scroller === null ? (
        <div aria-hidden>
          <Skeleton className="mb-xs h-5 w-24 rounded-xs" />
          <div className="grid gap-2xs" style={toColumnsStyle(columns)}>
            {toSkeletonKeys(columns * SKELETON_ROWS).map((key) => (
              <Skeleton key={key} className="aspect-square rounded-sm" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* WARN: REQUIREMENTS.md § 10. Zero height, no indicator — anything drawn above the reader here would move the grid twice, which the correction above exists to undo. */}
          <div ref={topSentinelRef} aria-hidden />
          {/* INFO: `getTotalSize()` already nets off `scrollMargin`, so this is the rows' own height; the row offsets do not, hence the subtraction on each `translateY` below. */}
          <div
            ref={contentRef}
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {renderRow(rows[item.index])}
              </div>
            ))}
          </div>
          {/* WARN: Inside this branch, never above it — mounted alongside the empty skeleton, the sentinel would be in view on every open and spend a page request before the first row draws. */}
          <div ref={sentinelRef} aria-hidden>
            {isLoadingMore && (
              <div
                className="grid gap-2xs"
                style={{
                  ...toColumnsStyle(columns),
                  marginTop: trailingGap > 0 ? -(geometry.tileSize + GRID_GAP) : undefined,
                }}
              >
                {toSkeletonKeys(skeletonCount).map((key, index) => (
                  <Skeleton
                    key={key}
                    className="aspect-square rounded-sm"
                    style={index === 0 ? { gridColumnStart: trailingGap + 1 } : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  function renderRow(row: Maybe<ArchiveGridRow>) {
    if (!row) {
      return null;
    }

    if (row.kind === "month") {
      return (
        // WARN: DESIGN.md § 7.10. Deliberately not `sticky` — pinned under the transparent header (§ 7.12.), it read as a rendering fault rather than a section label.
        // INFO: Bottom-aligned in its box, because the box carries the section's own leading gap above the label (`toRowHeight`) as well as the label itself.
        <div className="flex h-full items-end pb-xs">
          <h2 className="text-title-sm text-meta">{row.label}</h2>
        </div>
      );
    }

    return (
      <div className="grid gap-2xs" style={toColumnsStyle(columns)}>
        {cells.slice(row.startIndex, row.startIndex + row.count).map((cell, i) => (
          <ArchiveTile
            key={cell.id}
            cell={cell}
            isSelecting={isSelecting}
            isSelected={selected.has(cell.id)}
            isFlashing={cell.id === flashingId}
            onLongPress={onSweepStart ? (point) => hold(cell.id, point) : undefined}
            onActivate={(origin) => activate(cell.id, row.startIndex + i, origin)}
          />
        ))}
      </div>
    );
  }

  // INFO: The grid's width and its distance from the document top — every row offset the virtualizer computes is built on the two.
  // WARN: `window.scrollY` is added back so this stays the same at every scroll position — the raw viewport rect alone would fall short by however far the reader has scrolled.
  // WARN: `scrollY` alone, never combined with `documentElement`'s own rect — its `top` already *is* `-scrollY`, so adding both double-counts and drifts the window further with each screen scrolled.
  // WARN: Rounded — a layout-unit rect against a fractional `scrollY` jitters in the last bits, and the guard below would read every jitter as new geometry.
  function syncGeometry() {
    const content = contentRef.current;

    if (!content || !scroller) {
      return;
    }

    // WARN: AGENTS.md § 4.4. Deferred while the `lg` side panel animates — its width transition resizes this grid every frame, and re-measuring on each one is the jitter this guard exists to stop.
    if (isSidePanelAnimating()) {
      panelSettledUnsubscribeRef.current ??= onSidePanelSettled(() => {
        panelSettledUnsubscribeRef.current = null;
        syncGeometry();
      });

      return;
    }

    const width = content.clientWidth;
    const next = {
      tileSize: width > 0 ? toTileSize(width, columnsRef.current) : INITIAL_GEOMETRY.tileSize,
      scrollMargin: Math.round(content.getBoundingClientRect().top + window.scrollY),
    };

    setGeometry((previous) =>
      previous.tileSize === next.tileSize && previous.scrollMargin === next.scrollMargin
        ? previous
        : next,
    );
  }

  /** REQUIREMENTS.md § 10. The hold picks the tile it fired on and anchors the sweep there. */
  // WARN: The anchor is written after the sweep is armed, never before — arming disposes a sweep still running on another finger, and that disposal's `onEnd` clears this ref.
  function hold(id: MediaId, point: LongPressPoint) {
    onSweepStart?.(id);
    startSweep(point);
    anchorRef.current = indexById.get(id) ?? null;
  }

  // INFO: REQUIREMENTS.md § 10. The range between the anchor and the tile under the finger, in grid order — a drag fills row by row, and pulling back releases what it leaves. Indices into the flat cell list, never nodes, so the range reaching past the rendered window is unaffected.
  function sweepTo(id: MediaId) {
    const anchor = anchorRef.current;
    const index = indexById.get(id);

    if (anchor === null || index === undefined) {
      return;
    }

    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);

    onSweepTo(cells.slice(from, to + 1).map((cell) => cell.id));
  }

  function activate(id: string, index: number, origin: HTMLElement) {
    if (isSelecting) {
      onToggle(id);

      return;
    }

    onOpen(cells, index, origin);
  }
}

// WARN: DESIGN.md § 7.10. Mirror the `gap-2xs`, `gap-md` and `pb-xs` classes the markup is drawn with — every row offset is summed from these, so a class changed without its constant slides the grid out from under its own geometry.
const GRID_GAP = 4;
const SECTION_GAP = 16;
const MONTH_LABEL_GAP = 8;

// INFO: REQUIREMENTS.md § 8.3. `title-sm` at `1.45` is 20.3px, which WebKit floors and Chrome does not — the label is bottom-aligned in a box of this height, so the fraction is absorbed into the section gap above it rather than accumulating down the list.
const MONTH_LABEL_HEIGHT = 20;

// INFO: DESIGN.md § 3.3. The document is the app's scroller and outlives every shelf, so there is nothing to subscribe to.
const subscribeToScroller = () => () => {};
const readScroller = (): Nullable<HTMLElement> => document.documentElement;
const readServerScroller = (): Nullable<HTMLElement> => null;

// INFO: Only ever read before the first layout, where no row is rendered yet — a 3-column tile in a shell at its narrowest.
const INITIAL_GEOMETRY = { tileSize: 120, scrollMargin: 0 };

// INFO: Rows, not tiles, and generous because the sweep hit-tests the DOM (see the virtualizer's own WARN) — its auto-scroll travels at most 18px a frame, well inside this many lines.
const OVERSCAN_ROWS = 6;

// INFO: AGENTS.md § 4.1. An inline custom property rather than a static `grid-cols-N` class, so a pinch step or a 열 개수 slider drag is a single number to redraw the transition against.
function toColumnsStyle(columns: number): CSSProperties {
  return {
    "--archive-columns": columns,
    gridTemplateColumns: "repeat(var(--archive-columns), minmax(0, 1fr))",
  } as CSSProperties;
}

function toTileSize(width: number, columns: number): number {
  return (width - GRID_GAP * (columns - 1)) / columns;
}

// INFO: A line of tiles is a square plus the gutter; a month label is a fixed box plus its own `pb-xs`. Neither is measured, so these are the grid's real geometry, not a guess.
function toRowHeight(row: Maybe<ArchiveGridRow>, index: number, tileSize: number): number {
  if (row?.kind === "tiles") {
    return tileSize + GRID_GAP;
  }

  return (index === 0 ? 0 : SECTION_GAP - GRID_GAP) + MONTH_LABEL_HEIGHT + MONTH_LABEL_GAP;
}

// INFO: AGENTS.md § 4.1. The first tile still on screen under a given layout — walked with `toRowHeight` rather than the virtualizer's items, which by the time a column change is rendering already describe the next layout.
function readTopVisibleCellId(
  rows: ArchiveGridRow[],
  cells: MediaCell[],
  geometry: { tileSize: number; scrollMargin: number },
): Nullable<MediaId> {
  let bottom = geometry.scrollMargin;

  for (const [index, row] of rows.entries()) {
    bottom += toRowHeight(row, index, geometry.tileSize);

    if (row.kind === "tiles" && bottom > window.scrollY) {
      return cells[row.startIndex]?.id ?? null;
    }
  }

  return null;
}

/** Which virtual row holds a given tile — what § 10.'s jump scrolls to, since the list counts lines rather than tiles. */
function findRowIndex(rows: ArchiveGridRow[], cellIndex: Optional<number>): number {
  if (cellIndex === undefined) {
    return -1;
  }

  return rows.findIndex(
    (row) =>
      row.kind === "tiles" && cellIndex >= row.startIndex && cellIndex < row.startIndex + row.count,
  );
}

// INFO: DESIGN.md § 7.8. Three rows' worth, so the skeleton reads as a shelf rather than a single line; the next-page one is a single row, since more would claim a page size the response may not fill.
const SKELETON_ROWS = 3;

// INFO: How many columns of the last line are already taken, so the next page's skeletons resume in it rather than under it — the whole row is pulled up by one line to sit in the hole.
function toTrailingGap(rows: ArchiveGridRow[], columns: number): number {
  const last = rows.at(-1);

  return last?.kind === "tiles" ? last.count % columns : 0;
}

function toSkeletonKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index));
}
