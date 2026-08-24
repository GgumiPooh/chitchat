"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import {
  cn,
  formatDateWithWeekday,
  parseDayKey,
  type Holiday,
  type Milestone,
  type Nullable,
} from "@/shared/lib";
import { Button, EmptyState, Skeleton } from "@/shared/ui";
import {
  AgendaEventRow,
  AgendaStaticRow,
  HolidayDot,
  MilestoneDot,
} from "@/widgets/calendar-month";
import { CalendarDays } from "lucide-react";

export type DayAgendaProps = {
  className?: string;
  dayKey: string;
  isLoading: boolean;
  holiday: Nullable<Holiday>;
  milestones: Milestone[];
  occurrences: EventOccurrence[];
  participants: Participant[];
  onCreate: () => void;
  onSelect: (occurrence: EventOccurrence) => void;
};

/**
 * REQUIREMENTS.md § 11.3. The selected day's list, sitting under the grid rather
 * than in a sheet — the month and the day are readable at the same time, and
 * moving between days costs one tap instead of a dismiss and a tap.
 */
export function DayAgenda({
  className,
  dayKey,
  isLoading,
  holiday,
  milestones,
  occurrences,
  participants,
  onCreate,
  onSelect,
}: DayAgendaProps) {
  const isEmpty = occurrences.length === 0 && milestones.length === 0 && holiday === null;

  return (
    <section className={cn("space-y-xs", className)} aria-label="선택한 날의 일정">
      {/* INFO: The full date, not just the numeral — this is what stays on screen once the grid has scrolled away. */}
      <h2 className="text-title-md text-ink" aria-live="polite">
        {formatDateWithWeekday(parseDayKey(dayKey))}
      </h2>

      {isLoading && isEmpty ? (
        // WARN: A month still in flight is not an empty day. Without this the agenda asserts `이 날은 일정이 없어요` for every day a swipe lands on, for as long as the fetch takes.
        <ul className="space-y-2xs">
          <li>
            <Skeleton className="h-11 rounded-md" />
          </li>
          <li>
            <Skeleton className="h-11 rounded-md" />
          </li>
        </ul>
      ) : isEmpty ? (
        <EmptyState Icon={CalendarDays} description="이 날은 일정이 없어요" />
      ) : (
        <ul className="space-y-2xs">
          {/* INFO: REQUIREMENTS.md § 11.7. Above the milestones, and static for the same reason they are — a 공휴일 opens nothing. */}
          {holiday && (
            <AgendaStaticRow
              caption={holiday.isSubstitute ? "대체공휴일" : "공휴일"}
              label={holiday.name}
              marker={<HolidayDot />}
            />
          )}
          {/* INFO: REQUIREMENTS.md § 11.2. Listed above the events, and without the empty state a milestone-only day would otherwise get — the grid marked the day, so the list must say what marked it. */}
          {milestones.map((milestone) => (
            <AgendaStaticRow
              key={milestone.dayKey + milestone.label}
              caption="기념일"
              label={milestone.label}
              marker={<MilestoneDot />}
            />
          ))}
          {occurrences.map((occurrence) => (
            <AgendaEventRow
              key={occurrence.event.id + occurrence.startsAt}
              occurrence={occurrence}
              dayKey={dayKey}
              author={participants.find(({ id }) => id === occurrence.event.createdBy)}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      <Button haptic onClick={onCreate}>
        일정 추가
      </Button>
    </section>
  );
}
