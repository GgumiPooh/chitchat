"use client";

import type { ArchiveMedia } from "@/entities/media";
import { MESSAGE_FLASH_DURATION } from "@/shared/config";
import {
  cn,
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
} from "react";
import { useInView } from "react-intersection-observer";
import { toArchiveCells } from "../model/to-archive-cells";
import { ARCHIVE_GRID_COLUMNS, toArchiveRows, type ArchiveGridRow } from "../model/to-archive-rows";
import { useArchiveSweep } from "../model/use-archive-sweep";
import { ArchiveTile, isTileOnScreen } from "./archive-tile";

export type ArchiveGridProps = {
  className?: string;
  media: ArchiveMedia[];
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
   * DESIGN.md § 4.7.3. The slide the open viewer is on, so this shelf keeps a landing
   * for its closing morph within reach.
   *
   * WARN: Acted on **only where that tile is not already on screen**, which is the whole of the rule. Centring unconditionally would move the shelf under a reader who opened one photo and closed it again — and returning them to exactly where they were is the one thing that case has to do.
   * WARN: Unlike `targetId` this repeats, and it must: it is a position the reader is moving through rather than a destination a URL named once. It carries no flash for the same reason — nothing has been jumped to, and the tile is under an opaque viewer anyway.
   */
  revealId?: MediaId;
  /**
   * Given the whole ordered cell list and the tapped index, so the viewer can swipe
   * past the month it started in.
   *
   * INFO: DESIGN.md § 4.7.3. `origin` is the tile's own square, which the viewer's opening morph expands out of. A caller that does not animate simply ignores it.
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
 * windowed with `@tanstack/react-virtual` (REQUIREMENTS.md § 8.3.).
 *
 * INFO: One virtual row is one **line** of the grid, or one month label. Tiles are
 * not the unit: a month header has to scroll with the grid rather than float over it
 * (DESIGN.md § 7.10.), and a row list is what makes it a sibling of the lines it
 * labels rather than an overlay above them.
 *
 * INFO: Nothing here is measured, unlike chat's rows. A line of tiles is a square
 * whose side is arithmetic on the grid's own width, and a month label is a fixed box
 * — so `estimateSize` is exact and the whole family of § 8.3. measurement traps (the
 * commit-phase `flushSync`, the estimate→actual correction WebKit drops mid-gesture,
 * the rounding creep) has nothing to act on.
 */
export function ArchiveGrid({
  className,
  media,
  isLoadingMore,
  isLoadingNewer,
  hasHeldNewer,
  isSelecting,
  selected,
  targetId,
  revealId,
  onOpen,
  onToggle,
  onSweepStart,
  onSweepTo,
  onLoadMore,
  onLoadNewer,
  onInsertNewer,
}: ArchiveGridProps) {
  // WARN: Explicit, and it replaces a bailout this component used to get for free. The React Compiler skips any component calling `useVirtualizer`, because TanStack Virtual returns functions that go stale the moment they are memoized — but its list is keyed on that one name, and `useWindowVirtualizer` is not on it. Compiled, this grid memoizes `getVirtualItems` and stops re-windowing as the reader scrolls. `ChatRoom` still gets the implicit bailout; this one has to say so.
  "use no memo";

  const startSweep = useArchiveSweep({
    onEnter: sweepTo,
    onEnd: () => {
      anchorRef.current = null;
    },
  });
  const rows = useMemo(() => toArchiveRows(media), [media]);
  const cells = useMemo(() => toArchiveCells(media), [media]);
  const indexById = useMemo(() => new Map(cells.map((cell, i) => [cell.id, i])), [cells]);
  const anchorRef = useRef<Nullable<number>>(null);
  // WARN: The **sized container**, not the grid's root, because the upward sentinel sits between them. Every row offset is resolved from this element's top, and measuring an ancestor of it would put the whole window that far too high.
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
  // INFO: REQUIREMENTS.md § 10. Where the reader was, and how tall the list was, at the moment a held page was committed — the two numbers the scroll correction below is the difference of.
  const correctionRef = useRef<Nullable<{ top: number; total: number }>>(null);
  // INFO: DESIGN.md § 3.3. The document is the scroller, so there is no element to capture — this is `documentElement`, held only because `useSettledCommit` takes an element and tells a document scroller from an element one by identity.
  // WARN: `useSyncExternalStore` rather than state written from an effect, exactly as `ShellOverlay` reads the shell. The server snapshot is what keeps `document` out of the render, and the `null` frame it yields is also what holds the skeleton up until the geometry below has been measured.
  const scroller = useSyncExternalStore(subscribeToScroller, readScroller, readServerScroller);
  const [geometry, setGeometry] = useState(INITIAL_GEOMETRY);
  // INFO: DESIGN.md § 6.8. The tile a § 10. jump landed on, until its flash expires.
  const [flashingId, setFlashingId] = useState<Nullable<string>>(null);
  // INFO: The sentinel sits a screen below the last row, so the next page is usually in hand before the user reaches the bottom.
  const { ref: sentinelRef, inView } = useInView({ rootMargin: "600px" });
  // INFO: REQUIREMENTS.md § 10. Its mirror above the window, which only a § 10. jump can ever reach — a shelf opened from the newest has nothing over it and `loadNewer` answers that in one branch.
  const { ref: topSentinelRef, inView: isTopInView } = useInView({ rootMargin: "600px" });
  // WARN: REQUIREMENTS.md § 8.3. `getItemKey` has to be one stable function — virtual-core memoizes the whole measurement pass on its identity — and it has to see *this* render's rows, so they are written to a ref during render rather than in an effect, which is a commit behind.
  const rowsRef = useRef(rows);

  // eslint-disable-next-line react-hooks/refs -- the WARN above: the virtualizer reads `getItemKey` during render, so a layout effect lands a commit too late.
  rowsRef.current = rows;

  const getItemKey = useCallback((index: number) => rowsRef.current[index]?.key ?? index, []);
  // WARN: DESIGN.md § 3.3. The **window** virtualizer, because the document is what scrolls this shelf. Pointed at the `(main)` screen slot instead it reads `scrollTop` off a plain flow container — permanently `0`, with an `offsetHeight` equal to the whole list — so the range comes back as every row and the windowing is silently off rather than visibly broken.
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    // WARN: REQUIREMENTS.md § 8.3. Per row, never one flat guess — a month label and a line of tiles are nothing like the same height, and every offset in the list is summed from these.
    estimateSize: (index) => toRowHeight(rowsRef.current[index], index, geometry.tileSize),
    getItemKey,
    // WARN: The grid does not start at the top of the document — the floating header's clearance and the § 7.10. chips are above it, and without this every row resolves that much too high.
    scrollMargin: geometry.scrollMargin,
    // WARN: REQUIREMENTS.md § 10. Load-bearing for the sweep, not a scrolling nicety. The drag hit-tests the document with `elementsFromPoint`, so a tile the edge auto-scroll is about to bring under the finger needs a node before it gets there — the overscan is the only thing that guarantees one.
    overscan: OVERSCAN_ROWS,
    // WARN: No `anchorTo`, where chat holds the end. A prepend here is an upload the reader just made (§ 10.), and anchoring would hold the row they were looking at and push their own new photo off the top instead.
  });

  /**
   * INFO: Two triggers, and they are the only two that move this element. The § 7.10.
   * chips unmount in selection mode, which lifts the grid by their height; everything
   * else that moves or resizes it resizes the root element too — a rotation changes
   * its width, a page changes its height — which the observer below hears.
   *
   * WARN: Not a dependency-less effect, which is what this was. Each run forces layout
   * three times, and a render this component does **not** veto is the common case
   * rather than the rare one — every tile a sweep crosses rewrites the selection, and
   * that is the gesture whose frames are worth the most (§ 10.).
   */
  useLayoutEffect(syncGeometry, [scroller, isSelecting]);

  // WARN: Attached once per scroller, so it holds that render's `syncGeometry` — which is safe only because everything that closure reads is either the `scroller` in this dependency list or a ref. Give it more to read and it needs re-attaching.
  useEffect(() => {
    if (!scroller) {
      return;
    }

    const observer = new ResizeObserver(syncGeometry);

    observer.observe(scroller);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);

  // WARN: `estimateSize` is **not** one of the inputs virtual-core memoizes its measurements on, so a rotation that changes the tile size would otherwise leave every offset resolved against the old one.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [geometry.tileSize, virtualizer]);

  // WARN: `isLoadingMore` is a dependency on purpose, and it is the right one rather than `media.length`. A page landing while the sentinel is still on screen has to ask for the next one, and `inView` never changes in that case — but neither does `media.length` when a page arrives that deduplication empties, which stalls paging outright. Every finished load flips this false, so every finished load re-asks.
  useEffect(() => {
    if (inView) {
      onLoadMore();
    }
  }, [inView, isLoadingMore, onLoadMore]);

  // WARN: `isLoadingNewer` for the reason `isLoadingMore` is above, and it is the fetch that is keyed on rather than the insert — the page is held after it lands (§ 10.), so keying this on the commit would leave the sentinel silent for the whole wait.
  useEffect(() => {
    if (isTopInView) {
      onLoadNewer();
    }
  }, [isTopInView, isLoadingNewer, onLoadNewer]);

  /**
   * REQUIREMENTS.md § 10. Records where the reader is, then lets the hook insert.
   *
   * WARN: Memoized, and that is not a micro-optimization. `useSettledCommit` rebuilds
   * its `schedule` from this identity, and rebuilding it clears the pending timer and
   * re-attaches four listeners — so a plain function declaration here means **any**
   * render restarts the wait, and a render source steadier than `SETTLE_DELAY` starves
   * the commit for as long as it lasts. A sweep is exactly that: every tile the finger
   * crosses rewrites the selection. Chat memoizes its own `insertOlder` for this reason.
   *
   * WARN: Guarded on the held page, because `useSettledCommit` reports **every** settle
   * rather than only the ones a page is waiting on (§ 8.3.) — unguarded, a reader who
   * merely stops scrolling arms a correction against an offset the next unrelated
   * render then applies.
   */
  const commitHeldNewer = useCallback(() => {
    if (!hasHeldNewer || !scroller) {
      return;
    }

    correctionRef.current = { top: window.scrollY, total: virtualizer.getTotalSize() };
    onInsertNewer();
  }, [hasHeldNewer, scroller, virtualizer, onInsertNewer]);

  /**
   * REQUIREMENTS.md § 8.3., § 10. A page above the reader is committed only once the
   * scroller has gone still with no finger on it, because inserting there moves every
   * row below it and the scroll that answers for that is dropped mid-gesture.
   */
  useSettledCommit({ scroller, isPending: hasHeldNewer, onSettled: commitHeldNewer });

  /**
   * REQUIREMENTS.md § 10. Puts the reader back where they were after a newer page
   * landed above them, by the exact height the list grew.
   *
   * WARN: A **total-size delta**, where chat re-finds a keyed row (§ 8.3.). No key
   * survives this prepend: lines are cut from each month's own start, so a page
   * merging into the newest month by anything other than a multiple of three
   * regroups every line in it, and no row is the same row afterwards. Offsets are
   * the only thing that is still comparable.
   *
   * WARN: Safe as a delta only because nothing else here corrects the scroll — the
   * grid measures no rows and sets no `anchorTo`, so this is the single writer. Add
   * either and the two corrections compound, which is what § 8.3. warns of.
   */
  useLayoutEffect(() => {
    const correction = correctionRef.current;

    if (!correction || !scroller) {
      return;
    }

    correctionRef.current = null;
    // INFO: DESIGN.md § 3.3. The document's own scroll. A prepend does not move this shelf down the page, so `scrollMargin` is unchanged and the growth is entirely the list's — which makes the delta the whole correction.
    window.scrollTo(0, correction.top + (virtualizer.getTotalSize() - correction.total));
  });

  /**
   * REQUIREMENTS.md § 10. The photo the shelf was opened on, taken once at mount —
   * a URL is a destination rather than an instruction that repeats, exactly as 채팅
   * consumes its own `?message=` (§ 8.6.1.).
   *
   * WARN: Two frames, not one. `ScrollMemory` restores this route's remembered
   * offset inside a `requestAnimationFrame` of its own (`shared/ui/scroll-memory.tsx`),
   * so a jump asserted any earlier is overwritten by wherever the reader last left
   * the shelf. The second frame also has the scroller captured and the real tile size
   * measured, which the first does not.
   */
  useEffect(() => {
    if (!targetId) {
      return;
    }

    const index = findRowIndex(rowsRef.current, indexById.get(targetId));

    // INFO: § 8.6.1.'s vocabulary — the row is gone from the shelf (a 삭제 since the link was drawn) or was never on it, and the server has already answered with the newest page rather than an error.
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

  /**
   * DESIGN.md § 4.7.3. Brings the open viewer's own slide back under the grid, so the
   * photo has somewhere to shrink into when the reader closes it.
   *
   * INFO: The scroll is invisible — the viewer is an opaque `ShellOverlay` over this whole screen, and § 7.10.'s `touch-pan-x` means the reader cannot be scrolling it themselves at the same time.
   * WARN: Guarded on the tile already being on screen, not merely rendered. `scrollToIndex` is cheap here (nothing in this grid is measured, § 7.10.) but it is not free of consequence: run for a tile the reader can already see it re-centres the shelf, and they close the viewer onto a grid that has moved for no reason they can name.
   * INFO: A row the shelf has not paged in yet resolves to `-1` and is simply left alone. `endMediaMorph` reads that as a `dismiss` and the picture leaves with the scrim instead.
   */
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

  // INFO: DESIGN.md § 6.8. The flash is a moment, not a selection — nothing dismisses it but time.
  useEffect(() => {
    if (flashingId === null) {
      return;
    }

    const timer = setTimeout(() => setFlashingId(null), MESSAGE_FLASH_DURATION);

    return () => clearTimeout(timer);
  }, [flashingId]);

  return (
    <div className={cn("flex flex-col", className)}>
      {/* INFO: DESIGN.md § 7.8. The shelf's own skeleton until the scroller is in hand, which is one layout effect away — the alternative is a blank frame between `loading.tsx`'s tiles and the first windowed render, and a layout the eye settles on and then has taken away is the worse wait. */}
      {/* WARN: It draws the month label placeholder as well as the tiles, and `LibraryFallback` draws the identical pair. Tiles alone is a 28px step *up* from `loading.tsx` and a 28px step back *down* when the first real month row renders — this frame sits between those two, so it has to match both or it causes the very shift it is here to prevent. */}
      {scroller === null ? (
        <div aria-hidden>
          <Skeleton className="mb-xs h-5 w-24 rounded-xs" />
          <div className="grid grid-cols-3 gap-2xs">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="aspect-square rounded-sm" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* WARN: REQUIREMENTS.md § 10. Zero height, and it carries no indicator on purpose. Anything drawn here is above the reader, so putting it up while the page loads and taking it down when the page lands moves the grid twice — which is the shift the correction beside it exists to undo. */}
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
          {/* WARN: Inside this branch, never above it. The skeleton is a ninth of the loaded window's height, so a sentinel mounted alongside it is in view on every open and spends a page request before the first real row is drawn. */}
          <div ref={sentinelRef} aria-hidden>
            {isLoadingMore && (
              <div className="grid grid-cols-3 gap-2xs">
                {LOADING_KEYS.map((key) => (
                  <Skeleton key={key} className="aspect-square rounded-sm" />
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
        // WARN: DESIGN.md § 7.10. Deliberately not `sticky`. Pinned under the floating header it became an opaque strip cutting across the grid — the header is transparent (§ 7.12.), so tiles went on showing above the band and it read as a rendering fault rather than a section label.
        // INFO: Bottom-aligned in its box, because the box carries the section's own leading gap above the label (`toRowHeight`) as well as the label itself.
        <div className="flex h-full items-end pb-xs">
          <h2 className="text-title-sm text-meta">{row.label}</h2>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-2xs">
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

  /**
   * INFO: The grid's own width, and its distance from the top of the document —
   * every row offset the virtualizer computes is built on the two.
   *
   * WARN: `window.scrollY` is added back, so this is the same number at every scroll
   * position. Left as the raw viewport rect it would fall by however far the reader
   * has scrolled, and the whole window would resolve one screenful too high.
   *
   * WARN: And `scrollY` **alone** — never a delta against `documentElement`'s own
   * rect on top of it. That rect's `top` already *is* `-scrollY`, so subtracting it
   * and adding the scroll back counts the same offset twice, and the window drifts
   * a further screenful off with every screen the reader passes. It is the trap the
   * element-scroller spelling turns into when the document becomes the scroller.
   *
   * WARN: And rounded, because that sum is only invariant in exact arithmetic — a
   * rect snapped to a layout unit against a fractional `scrollY` jitters in the
   * last bits, and the guard below reads every jitter as a new geometry to render.
   */
  function syncGeometry() {
    const content = contentRef.current;

    if (!content || !scroller) {
      return;
    }

    const width = content.clientWidth;
    const next = {
      tileSize: width > 0 ? toTileSize(width) : INITIAL_GEOMETRY.tileSize,
      scrollMargin: Math.round(content.getBoundingClientRect().top + window.scrollY),
    };

    setGeometry((previous) =>
      previous.tileSize === next.tileSize && previous.scrollMargin === next.scrollMargin
        ? previous
        : next,
    );
  }

  /** REQUIREMENTS.md § 10. The hold picks the tile it fired on and anchors the sweep there. */
  // WARN: The anchor is written after the sweep is armed, never before. Arming disposes a sweep still running on another finger, and that disposal ends with the `onEnd` that clears this very ref.
  function hold(id: MediaId, point: LongPressPoint) {
    onSweepStart?.(id);
    startSweep(point);
    anchorRef.current = indexById.get(id) ?? null;
  }

  /**
   * REQUIREMENTS.md § 10. The range between the anchor and the tile the finger is
   * over, in grid order — so a drag fills row by row rather than picking out the
   * tiles its path happened to touch, and pulling back releases what it leaves.
   *
   * INFO: Indices into the flat cell list, never nodes, so a range reaching past the
   * rendered window is the same range it always was — only the tile the finger is
   * *on* has to exist in the DOM, and that one is by definition on screen.
   */
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

/**
 * WARN: DESIGN.md § 7.10. These mirror the `gap-2xs`, `gap-md` and `pb-xs` the markup
 * above is drawn with, and every row offset in the list is summed from them — a class
 * changed without the constant beside it slides the grid out from under its own
 * geometry, and `LibraryFallback`'s 사진 skeleton out of step with it (§ 7.8.).
 */
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

function toTileSize(width: number): number {
  return (width - GRID_GAP * (ARCHIVE_GRID_COLUMNS - 1)) / ARCHIVE_GRID_COLUMNS;
}

/**
 * INFO: A line of tiles is a square plus the gutter below it; a month label is a
 * fixed box plus its own `pb-xs`. Neither is ever measured (see the component's own
 * INFO), so these are the grid's real geometry rather than a guess at it.
 *
 * INFO: The section's `gap-md` rides on its label, less the gutter the line above it
 * already carries — the first label has no section above it to be spaced from.
 */
function toRowHeight(row: Maybe<ArchiveGridRow>, index: number, tileSize: number): number {
  if (row?.kind === "tiles") {
    return tileSize + GRID_GAP;
  }

  return (index === 0 ? 0 : SECTION_GAP - GRID_GAP) + MONTH_LABEL_HEIGHT + MONTH_LABEL_GAP;
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

// WARN: DESIGN.md § 7.8. Nine, because `LibraryFallback` draws nine for this shelf and the two frames are consecutive — but the count is only half of being one shape, and the label placeholder above them is the other half. Change either here and change it there.
const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

// INFO: DESIGN.md § 7.8. One row of placeholders while the next page is in flight; more would claim a page size the response may not fill.
const LOADING_KEYS = ["a", "b", "c"];
