"use client";

import type { EventOccurrence } from "@/entities/event";
import { cn, formatTimeLeft, formatUpcomingWhen, isImminent, type Nullable } from "@/shared/lib";
import { EmptyState, EventDot, EventMemo, HapticTap, HapticTarget } from "@/shared/ui";
import { CalendarClock, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type UpcomingEventsListProps = {
  className?: string;
  listClassName?: string;
  /** REQUIREMENTS.md § 11.5.1. Off where the list's height is already bounded by its column, as in the side panel — held there, the list never takes the room the column later grants it. */
  pinsHeight?: boolean;
  /** REQUIREMENTS.md § 11.5.1. The side panel's mode — no 더 보기, the next page is asked for as the list's end scrolls into view. */
  loadsOnScroll?: boolean;
  occurrences: EventOccurrence[];
  todayKey: string;
  /** REQUIREMENTS.md § 11.5.1. The clock the imminent rows count down against. */
  now: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (occurrence: EventOccurrence) => void;
};

/**
 * REQUIREMENTS.md § 11.5.1. 다가오는 일정's rows on their own, shared by the
 * floating chat overlay (`UpcomingEventsPanel`) and the desktop side panel,
 * each of which supplies its own chrome around this.
 */
export function UpcomingEventsList({
  className,
  listClassName,
  pinsHeight = true,
  loadsOnScroll = false,
  occurrences,
  todayKey,
  now,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
}: UpcomingEventsListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  // INFO: How many rows stood before the page in flight was asked for — its first new row is that index.
  const pendingFrom = useRef<Nullable<number>>(null);
  // INFO: REQUIREMENTS.md § 11.5.1. The list's own height at the moment of the first 더 보기, held from then on.
  const [lockedHeight, setLockedHeight] = useState<Nullable<number>>(null);

  // WARN: Held until the page has actually landed — moved earlier the scroll is computed against a list a page short and clamps to its bottom.
  useEffect(() => {
    if (isLoadingMore) {
      return;
    }

    const index = pendingFrom.current;
    const list = listRef.current;
    const row = index === null ? undefined : list?.children[index];

    if (index === null || !list || !(row instanceof HTMLElement)) {
      return;
    }

    pendingFrom.current = null;

    // WARN: Clamped by hand — iOS WebKit's smooth scroll takes a target past the end literally and parks the list rubber-banded there until the next touch scroll.
    const top = Math.min(
      row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop,
      list.scrollHeight - list.clientHeight,
    );

    list.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [isLoadingMore, occurrences.length]);

  // WARN: Rooted on the list, not the viewport — the panel's column is `overflow-y-auto` above it, and against the viewport the sentinel is "visible" the moment the list mounts.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const list = listRef.current;

    if (!loadsOnScroll || !hasMore || isLoadingMore || !sentinel || !list) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onLoadMore();
        }
      },
      { root: list },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadsOnScroll, hasMore, isLoadingMore, onLoadMore]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {occurrences.length === 0 ? (
        <EmptyState
          className="px-md py-md"
          Icon={CalendarClock}
          description="다가오는 일정이 없어요"
        />
      ) : (
        // WARN: The **list** is what is measured and pinned, not the card around it — pressing 더 보기 must not resize it under the finger.
        <ul
          ref={listRef}
          className={cn(
            "scrollbar-hidden min-h-0 divide-y divide-hairline overflow-y-auto overscroll-contain",
            listClassName,
          )}
          style={lockedHeight === null ? undefined : { height: lockedHeight }}
        >
          {occurrences.map((occurrence) => {
            // WARN: `now` is `0` until the client has read the clock, which is what keeps this row identical to the HTML the server sent.
            const isSoon = now > 0 && isImminent(occurrence, now);

            return (
              <li key={occurrence.event.id + occurrence.startsAt} className="group relative flex">
                <button
                  className="flex w-full cursor-pointer items-start gap-xs px-md py-sm text-left transition-colors outline-none group-active:bg-surface-soft hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-soft"
                  type="button"
                  onClick={() => onSelect(occurrence)}
                >
                  <EventDot
                    className="mt-1.5"
                    size="row"
                    color={occurrence.event.color}
                    scope={occurrence.event.scope}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-xs">
                      <span className="min-w-0 flex-1 truncate text-title-sm text-ink">
                        {occurrence.event.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-caption",
                          isSoon ? "text-primary" : "text-meta",
                        )}
                      >
                        {isSoon
                          ? formatTimeLeft(occurrence, now)
                          : formatUpcomingWhen(occurrence, todayKey)}
                      </span>
                    </span>
                    <EventMemo description={occurrence.event.description} />
                  </span>
                </button>
                {/* WARN: `keepsScroll` — the row runs the width of the panel, so a finger scrolling the list lands here (`DESIGN.md § 7.15.1.`). */}
                <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
              </li>
            );
          })}
          {loadsOnScroll && hasMore && (
            <li ref={sentinelRef} className="py-sm text-center text-caption text-meta" aria-hidden>
              불러오는 중
            </li>
          )}
        </ul>
      )}
      {!loadsOnScroll && hasMore && (
        // WARN: DESIGN.md § 7.15.1. `keepsScroll` — the panel's column scrolls under a finger and this row runs its full width, so a bare switch overlay would claim the drag before the scroller saw it.
        <HapticTarget
          className="flex w-full shrink-0"
          overlayClassName="touch-pan-y"
          isTicking={!isLoadingMore}
          keepsScroll
        >
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2xs border-t border-hairline py-sm text-caption text-meta transition-colors outline-none group-active:bg-surface-soft hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isLoadingMore}
            onClick={expand}
          >
            {isLoadingMore ? "불러오는 중" : "더 보기"}
            {!isLoadingMore && <ChevronDown className="size-4" strokeWidth={1.75} />}
          </button>
        </HapticTarget>
      )}
    </div>
  );

  // WARN: Measured **before** the page is asked for, in the handler rather than in an effect — a frame later the new rows are already in the list and the height read back includes them.
  function expand() {
    if (pinsHeight && lockedHeight === null && listRef.current) {
      setLockedHeight(listRef.current.getBoundingClientRect().height);
    }

    pendingFrom.current = occurrences.length;
    // WARN: DESIGN.md § 7.15.2. A task, so the `keepsScroll` overlay outlives the dispatch — `isLoadingMore` unmounts it, and a `<label>` detached before its activation finds no switch to tick.
    setTimeout(() => onLoadMore());
  }
}
