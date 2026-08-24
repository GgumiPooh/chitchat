import type { EventOccurrence } from "@/entities/event";
import { cn, toDayKey, type Nullable } from "@/shared/lib";
import { HapticTap } from "@/shared/ui";
import { EventDot, EventMemo } from "@/widgets/calendar-month";
import { CalendarClock, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUpcomingWhen } from "../model/format-event";

// INFO: A constant rather than `useId`, because the card renders once per screen and the value has to be readable in two places.
const HEADING_ID = "upcoming-events-heading";

export type UpcomingCardProps = {
  className?: string;
  occurrences: EventOccurrence[];
  todayKey: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (dayKey: string) => void;
};

/**
 * DESIGN.md § 7.9. The next few events, directly under the D-day band.
 *
 * WARN: It always draws — an empty state where it used to render nothing. Above the
 * grid a section that disappears is a section that moves the month, which is the whole
 * reason this used to sit at the foot of the screen.
 */
export function UpcomingCard({
  className,
  occurrences,
  todayKey,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
}: UpcomingCardProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // INFO: How many rows stood before the page in flight was asked for — its first new row is that index.
  const pendingFrom = useRef<Nullable<number>>(null);
  // INFO: REQUIREMENTS.md § 11.5.1. The list's own height at the moment of the first 더 보기, held from then on.
  const [lockedHeight, setLockedHeight] = useState<Nullable<number>>(null);

  // WARN: Held until the page has actually landed. `limit` steps on the press and reveals the one row already in hand, so the list grows by **one** first — moved on that render the scroll is computed against a list a page short, clamps to its bottom, and the rows that follow arrive under a reader who has been left where they started.
  // INFO: The row to move to is fixed at the press, and the ref is cleared on use — a refresh landing later also grows the list and must not scroll the reader a second time.
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

    const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;

    // INFO: REQUIREMENTS.md § 11.5.1. The arriving row is put at the top edge, with no inset held back for the one before it — the page the reader asked for is what the list should be showing.
    // WARN: A page arrives at the **end** of the list, so this is already the maximum scroll and the browser clamps it. Nothing may be added past it expecting to travel further.
    // INFO: DESIGN.md § 4.7. Reduced motion keeps the destination and drops the travel, which is the one thing here that is motion for its own sake.
    list.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [isLoadingMore, occurrences.length]);

  return (
    <section className={cn("space-y-2xs", className)} aria-labelledby={HEADING_ID}>
      {/* INFO: Named on screen, not only to a screen reader — the day agenda below the grid is a second list of events, and two unlabelled stacks of rows on one screen read as one. */}
      <h2 className="text-title-sm text-meta" id={HEADING_ID}>
        다가오는 일정
      </h2>
      <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
        {occurrences.length === 0 ? (
          <p className="flex items-center gap-xs px-md py-sm text-caption text-meta">
            <CalendarClock className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
            다가오는 일정이 없어요
          </p>
        ) : (
          // WARN: The **list** is what is pinned, and 더 보기 sits outside it. The grid is directly below, so a press that grew this section would push the month down under the thumb — and the button leaving on the last page has to take its own row off the card rather than out of the scroller.
          <ul
            ref={listRef}
            className={cn(
              "divide-y divide-hairline",
              lockedHeight !== null && "scrollbar-hidden overflow-y-auto overscroll-contain",
            )}
            style={lockedHeight === null ? undefined : { height: lockedHeight }}
            aria-labelledby={HEADING_ID}
          >
            {occurrences.map((occurrence) => (
              <li key={occurrence.event.id + occurrence.startsAt} className="group relative flex">
                <button
                  className="flex w-full cursor-pointer items-start gap-xs px-md py-sm text-left transition-colors outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-strong"
                  type="button"
                  onClick={() => onSelect(toTargetDayKey(occurrence, todayKey))}
                >
                  {/* INFO: The dot is 4px against a multi-line row, so it is nudged onto the title's own baseline rather than centred against the whole stack. */}
                  <EventDot
                    className="mt-[7px]"
                    color={occurrence.event.color}
                    scope={occurrence.event.scope}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-xs">
                      <span className="min-w-0 flex-1 truncate text-title-sm text-ink">
                        {occurrence.event.title}
                      </span>
                      <span className="shrink-0 text-caption text-meta">
                        {formatUpcomingWhen(occurrence, todayKey)}
                      </span>
                    </span>
                    <EventMemo description={occurrence.event.description} />
                  </span>
                </button>
                {/* WARN: `keepsScroll` — the row runs the width of the card, so a finger scrolling the calendar lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
                <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button
            className="flex w-full cursor-pointer items-center justify-center gap-2xs border-t border-hairline py-sm text-caption text-meta transition-colors outline-none hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={isLoadingMore}
            onClick={expand}
          >
            {isLoadingMore ? "불러오는 중" : "더 보기"}
            {!isLoadingMore && <ChevronDown className="size-4" strokeWidth={1.75} />}
          </button>
        )}
      </div>
    </section>
  );

  // WARN: Measured **before** the page is asked for, in the handler rather than in an effect — a frame later the new rows are already in the list and the height read back includes them.
  function expand() {
    if (lockedHeight === null && listRef.current) {
      setLockedHeight(listRef.current.getBoundingClientRect().height);
    }

    pendingFrom.current = occurrences.length;
    onLoadMore();
  }
}

/**
 * WARN: Clamped to today. An occurrence that began before today reads `진행 중`
 * (`formatUpcomingWhen`), and sending the grid to the day it started rewinds the
 * calendar a fortnight — often into a past month — to answer a tap on something
 * happening now.
 */
function toTargetDayKey(occurrence: EventOccurrence, todayKey: string): string {
  const startDayKey = toDayKey(occurrence.startsAt);

  return startDayKey < todayKey ? todayKey : startDayKey;
}
