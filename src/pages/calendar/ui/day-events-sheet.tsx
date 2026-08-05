"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { cn, formatDateWithWeekday, parseDayKey, type Optional } from "@/shared/lib";
import { Avatar, BottomSheet, Button, EmptyState } from "@/shared/ui";
import { EventDot } from "@/widgets/calendar-month";
import { CalendarDays } from "lucide-react";
import { formatOccurrenceTime } from "../model/format-event";

export type DayEventsSheetProps = {
  className?: string;
  isOpen: boolean;
  dayKey: string;
  occurrences: EventOccurrence[];
  participants: Participant[];
  onClose: () => void;
  onCreate: () => void;
  onSelect: (occurrence: EventOccurrence) => void;
};

/** REQUIREMENTS.md § 11.3. Tapping a day opens that day's list. */
export function DayEventsSheet({
  className,
  isOpen,
  dayKey,
  occurrences,
  participants,
  onClose,
  onCreate,
  onSelect,
}: DayEventsSheetProps) {
  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{ title: formatDateWithWeekday(parseDayKey(dayKey)) }}
      onClose={onClose}
    >
      <div className="space-y-sm">
        {occurrences.length === 0 ? (
          // INFO: REQUIREMENTS.md § 11.5. A day with nothing on it still gets a state of its own rather than a bare gap above the button.
          <EmptyState Icon={CalendarDays} description="이 날은 일정이 없어요" />
        ) : (
          <ul className="space-y-2xs">
            {occurrences.map((occurrence) => (
              <li key={occurrence.event.id + occurrence.startsAt}>
                <button
                  className="flex min-h-11 w-full cursor-pointer items-center gap-xs rounded-md bg-surface-soft px-md py-sm text-left transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed"
                  type="button"
                  onClick={() => onSelect(occurrence)}
                >
                  <EventDot color={occurrence.event.color} scope={occurrence.event.scope} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-title-sm text-ink">
                      {occurrence.event.title}
                    </span>
                    <span className="block text-caption text-meta">
                      {formatOccurrenceTime(occurrence)}
                    </span>
                  </span>
                  {/* INFO: REQUIREMENTS.md § 11.4. Authorship is shown, never enforced — either user may edit any event. */}
                  <Author
                    participant={participants.find(({ id }) => id === occurrence.event.createdBy)}
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button onClick={onCreate}>일정 추가</Button>
      </div>
    </BottomSheet>
  );
}

type AuthorProps = {
  className?: string;
  participant: Optional<Participant>;
};

function Author({ className, participant }: AuthorProps) {
  if (!participant) {
    return null;
  }

  // INFO: No `src` yet, matching the chat row — the avatar image waits on the § 12. profile editor (§ 8.7.), and until then both surfaces show the initial-letter fallback.
  return <Avatar className={cn("size-6 shrink-0", className)} name={participant.name} />;
}
