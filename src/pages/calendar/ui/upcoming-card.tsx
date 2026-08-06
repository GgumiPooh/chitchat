import type { EventOccurrence } from "@/entities/event";
import { cn, toDayKey } from "@/shared/lib";
import { HapticTap } from "@/shared/ui";
import { EventDot } from "@/widgets/calendar-month";
import { formatUpcomingWhen } from "../model/format-event";

export type UpcomingCardProps = {
  className?: string;
  occurrences: EventOccurrence[];
  todayKey: string;
  onSelect: (dayKey: string) => void;
};

/**
 * DESIGN.md § 7.9. The next one or two events.
 *
 * WARN: Renders nothing when there are none — never an empty state. A card
 * announcing that there is nothing to announce is worse than no card.
 */
export function UpcomingCard({ className, occurrences, todayKey, onSelect }: UpcomingCardProps) {
  if (occurrences.length === 0) {
    return null;
  }

  return (
    <ul
      className={cn(
        "divide-y divide-hairline rounded-md border border-hairline bg-canvas",
        className,
      )}
      aria-label="다가오는 일정"
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
            onClick={() => onSelect(toDayKey(occurrence.startsAt))}
          >
            <EventDot color={occurrence.event.color} scope={occurrence.event.scope} />
            <span className="flex-1 truncate text-title-sm text-ink">{occurrence.event.title}</span>
            <span className="shrink-0 text-caption text-meta">
              {formatUpcomingWhen(occurrence, todayKey)}
            </span>
          </button>
          <HapticTap forwardsTap />
        </li>
      ))}
    </ul>
  );
}
