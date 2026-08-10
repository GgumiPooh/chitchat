import type { EventOccurrence } from "@/entities/event";
import { cn, toDayKey } from "@/shared/lib";
import { HapticTap } from "@/shared/ui";
import { EventDot } from "@/widgets/calendar-month";
import { formatUpcomingWhen } from "../model/format-event";

// INFO: A constant rather than `useId`, because the card renders once per screen and the value has to be readable in two places.
const HEADING_ID = "upcoming-events-heading";

export type UpcomingCardProps = {
  className?: string;
  occurrences: EventOccurrence[];
  todayKey: string;
  onSelect: (dayKey: string) => void;
};

/**
 * DESIGN.md § 7.9. The next few events, up to `MAX_UPCOMING_EVENTS`, at the foot of
 * the screen.
 *
 * WARN: Renders nothing when there are none — never an empty state. A card
 * announcing that there is nothing to announce is worse than no card. That is also
 * why it may not sit above the grid: a section that varies between nothing and three
 * rows moves every tap target under it.
 */
export function UpcomingCard({ className, occurrences, todayKey, onSelect }: UpcomingCardProps) {
  if (occurrences.length === 0) {
    return null;
  }

  return (
    <section className={cn("space-y-2xs", className)} aria-labelledby={HEADING_ID}>
      {/* INFO: Named on screen, not only to a screen reader — the day agenda below the grid is a second list of events, and two unlabelled stacks of rows on one screen read as one. */}
      <h2 className="text-title-sm text-meta" id={HEADING_ID}>
        다가오는 일정
      </h2>
      <ul
        className="divide-y divide-hairline rounded-md border border-hairline bg-canvas"
        aria-labelledby={HEADING_ID}
      >
        {/* WARN: The end radii sit on the row, not on the button. The overlay is a second child, so the button is no longer `:last-child` and `last:rounded-b-md` would never match again. */}
        {occurrences.map((occurrence) => (
          <li
            key={occurrence.event.id + occurrence.startsAt}
            className="group relative flex overflow-hidden first:rounded-t-md last:rounded-b-md"
          >
            <button
              className="flex min-h-11 w-full cursor-pointer items-center gap-xs px-md py-sm text-left transition-colors outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-strong"
              type="button"
              onClick={() => onSelect(toTargetDayKey(occurrence, todayKey))}
            >
              <EventDot color={occurrence.event.color} scope={occurrence.event.scope} />
              <span className="flex-1 truncate text-title-sm text-ink">
                {occurrence.event.title}
              </span>
              <span className="shrink-0 text-caption text-meta">
                {formatUpcomingWhen(occurrence, todayKey)}
              </span>
            </button>
            {/* WARN: `keepsScroll` — the row runs the width of the card, so a finger scrolling the calendar lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
            <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
          </li>
        ))}
      </ul>
    </section>
  );
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
