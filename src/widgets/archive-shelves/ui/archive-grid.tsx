"use client";

import type { ArchiveMedia } from "@/entities/media";
import { cn, type LongPressPoint, type Nullable } from "@/shared/lib";
import { Skeleton, type MediaCell } from "@/shared/ui";
import { useEffect, useMemo, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { toArchiveCells } from "../model/to-archive-cells";
import { toArchiveSections } from "../model/to-archive-sections";
import { useArchiveSweep } from "../model/use-archive-sweep";
import { ArchiveTile } from "./archive-tile";

export type ArchiveGridProps = {
  className?: string;
  media: ArchiveMedia[];
  isLoadingMore: boolean;
  isSelecting: boolean;
  selected: Set<string>;
  /** Given the whole ordered cell list and the tapped index, so the viewer can swipe past the month it started in. */
  onOpen: (cells: MediaCell[], index: number) => void;
  onToggle: (id: string) => void;
  /** REQUIREMENTS.md § 10. Holding a tile picks it and anchors the sweep, entering selection mode if it is not on yet; omitted while selection is unavailable. */
  onSweepStart?: (id: string) => void;
  /** REQUIREMENTS.md § 10. Every id from the held tile to the one under the finger, in grid order — the range, not the tile that changed. */
  onSweepTo: (ids: string[]) => void;
  onLoadMore: () => void;
};

/**
 * DESIGN.md § 7.10. The reverse-chronological grid with month section headers.
 *
 * INFO: Not virtualized, unlike chat (REQUIREMENTS.md § 8.3.). A tile is a fixed
 * square with no measurement to invalidate, and the page only grows as far as the
 * user scrolls — the cost chat's virtualizer exists to avoid is variable-height
 * rows re-measuring, which this layout has none of.
 */
export function ArchiveGrid({
  className,
  media,
  isLoadingMore,
  isSelecting,
  selected,
  onOpen,
  onToggle,
  onSweepStart,
  onSweepTo,
  onLoadMore,
}: ArchiveGridProps) {
  const startSweep = useArchiveSweep({
    onEnter: sweepTo,
    onEnd: () => {
      anchorRef.current = null;
    },
  });
  const sections = useMemo(() => toArchiveSections(media), [media]);
  const cells = useMemo(() => toArchiveCells(media), [media]);
  const indexById = useMemo(() => new Map(cells.map((cell, i) => [cell.id, i])), [cells]);
  const anchorRef = useRef<Nullable<number>>(null);
  // INFO: The sentinel sits a screen below the last row, so the next page is usually in hand before the user reaches the bottom.
  const { ref: sentinelRef, inView } = useInView({ rootMargin: "600px" });

  // WARN: `isLoadingMore` is a dependency on purpose, and it is the right one rather than `media.length`. A page landing while the sentinel is still on screen has to ask for the next one, and `inView` never changes in that case — but neither does `media.length` when a page arrives that deduplication empties, which stalls paging outright. Every finished load flips this false, so every finished load re-asks.
  useEffect(() => {
    if (inView) {
      onLoadMore();
    }
  }, [inView, isLoadingMore, onLoadMore]);

  return (
    <div className={cn("flex flex-col gap-md", className)}>
      {sections.map((section) => (
        <section key={section.monthKey}>
          {/* WARN: DESIGN.md § 7.10. Deliberately not `sticky`. Pinned under the floating header it became an opaque strip cutting across the grid — the header is transparent (§ 7.12.), so tiles went on showing above the band and it read as a rendering fault rather than a section label. */}
          <h2 className="pb-xs text-title-sm text-meta">{section.label}</h2>
          <div className="grid grid-cols-3 gap-2xs">
            {cells.slice(section.startIndex, section.startIndex + section.count).map((cell, i) => (
              <ArchiveTile
                key={cell.id}
                cell={cell}
                isSelecting={isSelecting}
                isSelected={selected.has(cell.id)}
                onLongPress={onSweepStart ? (point) => hold(cell.id, point) : undefined}
                onActivate={() => activate(cell.id, section.startIndex + i)}
              />
            ))}
          </div>
        </section>
      ))}
      <div ref={sentinelRef} aria-hidden>
        {isLoadingMore && (
          <div className="grid grid-cols-3 gap-2xs">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="aspect-square rounded-sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /** REQUIREMENTS.md § 10. The hold picks the tile it fired on and anchors the sweep there. */
  // WARN: The anchor is written after the sweep is armed, never before. Arming disposes a sweep still running on another finger, and that disposal ends with the `onEnd` that clears this very ref.
  function hold(id: string, point: LongPressPoint) {
    onSweepStart?.(id);
    startSweep(point);
    anchorRef.current = indexById.get(id) ?? null;
  }

  /**
   * REQUIREMENTS.md § 10. The range between the anchor and the tile the finger is
   * over, in grid order — so a drag fills row by row rather than picking out the
   * tiles its path happened to touch, and pulling back releases what it leaves.
   */
  function sweepTo(id: string) {
    const anchor = anchorRef.current;
    const index = indexById.get(id);

    if (anchor === null || index === undefined) {
      return;
    }

    const from = Math.min(anchor, index);
    const to = Math.max(anchor, index);

    onSweepTo(cells.slice(from, to + 1).map((cell) => cell.id));
  }

  function activate(id: string, index: number) {
    if (isSelecting) {
      onToggle(id);

      return;
    }

    onOpen(cells, index);
  }
}

// INFO: DESIGN.md § 7.8. One row of placeholders while the next page is in flight; more would claim a page size the response may not fill.
const SKELETON_KEYS = ["a", "b", "c"];
