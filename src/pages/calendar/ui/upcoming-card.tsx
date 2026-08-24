import type { EventOccurrence } from "@/entities/event";
import { cn, type Nullable } from "@/shared/lib";
import {
  UPCOMING_HEADING_ID,
  UpcomingEmptyRow,
  UpcomingEventRow,
  UpcomingSection,
} from "@/widgets/calendar-month";
import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const moreRef = useRef<HTMLButtonElement>(null);
  // INFO: The 더 보기 row's height while it is standing, so the list can take that height over the moment it goes.
  const standingMoreHeight = useRef(0);
  // INFO: REQUIREMENTS.md § 11.5.1. The list's own height at the moment of the first 더 보기, held from then on.
  const [lockedHeight, setLockedHeight] = useState<Nullable<number>>(null);

  /**
   * WARN: DESIGN.md § 7.9. The **list** absorbs the 더 보기 row when the last page
   * lands, growing by exactly its height. § 11.5.1.'s panel does the opposite and
   * lets the row leave, because it floats over a conversation with nothing beneath
   * it — here the month grid is directly below, so a card that shrank would pull the
   * whole screen up under a reader who had just pressed a button.
   *
   * WARN: A layout effect, or the frame between the row unmounting and the height
   * being restored paints the shrunken card and the grid jumps and comes back.
   */
  useLayoutEffect(() => {
    if (moreRef.current) {
      standingMoreHeight.current = moreRef.current.getBoundingClientRect().height;

      return;
    }

    const absorbed = standingMoreHeight.current;

    standingMoreHeight.current = 0;

    // INFO: Only while pinned. Unpinned the section is already sized to its rows, and the count changing is what took the button away — there is no press to hold the screen still for.
    setLockedHeight((current) =>
      current === null || absorbed === 0 ? current : current + absorbed,
    );
  }, [hasMore]);

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
    <UpcomingSection className={className}>
      {occurrences.length === 0 ? (
        <UpcomingEmptyRow />
      ) : (
        // WARN: The **list** is what is pinned, and 더 보기 sits outside it. The grid is directly below, so a press that grew this section would push the month down under the thumb — and the button leaving on the last page has to take its own row off the card rather than out of the scroller.
        <ul
          ref={listRef}
          className={cn(
            "divide-y divide-hairline",
            lockedHeight !== null && "scrollbar-hidden overflow-y-auto overscroll-contain",
          )}
          style={lockedHeight === null ? undefined : { height: lockedHeight }}
          aria-labelledby={UPCOMING_HEADING_ID}
        >
          {occurrences.map((occurrence) => (
            <UpcomingEventRow
              key={occurrence.event.id + occurrence.startsAt}
              occurrence={occurrence}
              todayKey={todayKey}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          ref={moreRef}
          className="flex w-full cursor-pointer items-center justify-center gap-2xs border-t border-hairline py-sm text-caption text-meta transition-colors outline-none hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={isLoadingMore}
          onClick={expand}
        >
          {isLoadingMore ? "불러오는 중" : "더 보기"}
          {!isLoadingMore && <ChevronDown className="size-4" strokeWidth={1.75} />}
        </button>
      )}
    </UpcomingSection>
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
