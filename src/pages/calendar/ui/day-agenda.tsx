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
  type Optional,
} from "@/shared/lib";
import { Avatar, Button, EmptyState, HapticTap, Skeleton } from "@/shared/ui";
import { EventDot, EventMemo, HolidayDot, MilestoneDot } from "@/widgets/calendar-month";
import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import { formatMultiDaySpan, formatOccurrenceTime } from "../model/format-event";

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
            <StaticRow
              caption={holiday.isSubstitute ? "대체공휴일" : "공휴일"}
              label={holiday.name}
              marker={<HolidayDot />}
            />
          )}
          {/* INFO: REQUIREMENTS.md § 11.2. Listed above the events, and without the empty state a milestone-only day would otherwise get — the grid marked the day, so the list must say what marked it. */}
          {milestones.map((milestone) => (
            <StaticRow
              key={milestone.dayKey + milestone.label}
              caption="기념일"
              label={milestone.label}
              marker={<MilestoneDot />}
            />
          ))}
          {occurrences.map((occurrence) => (
            <li key={occurrence.event.id + occurrence.startsAt} className="group relative flex">
              <button
                className="flex min-h-11 w-full cursor-pointer items-center gap-xs rounded-md bg-surface-soft px-md py-sm text-left transition-colors outline-none group-active:bg-surface-pressed hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-pressed"
                type="button"
                onClick={() => onSelect(occurrence)}
              >
                <EventDot color={occurrence.event.color} scope={occurrence.event.scope} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm text-ink">
                    {occurrence.event.title}
                  </span>
                  {/* INFO: REQUIREMENTS.md § 11.5. Scope is named rather than left to the 4px ring the grid uses — at this size a word is legible where the shape is not, and `개인` is viewer-neutral where `내` would be wrong for whichever of the two did not write it. */}
                  <span className="block text-caption text-meta">
                    {[
                      formatMultiDaySpan(occurrence),
                      formatOccurrenceTime(occurrence, dayKey),
                      occurrence.event.scope === "mine" ? "개인 일정" : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <EventMemo description={occurrence.event.description} />
                </span>
                {/* INFO: REQUIREMENTS.md § 11.4. Authorship is shown, never enforced — either user may edit any event. */}
                <Author
                  participant={participants.find(({ id }) => id === occurrence.event.createdBy)}
                />
              </button>
              {/* WARN: `keepsScroll` — the row runs the width of the shell, so a finger scrolling the screen lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
              <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
            </li>
          ))}
        </ul>
      )}

      <Button haptic onClick={onCreate}>
        일정 추가
      </Button>
    </section>
  );
}

type StaticRowProps = {
  className?: string;
  marker: ReactNode;
  label: string;
  caption: string;
};

/**
 * DESIGN.md § 7.9. The treatment a 공휴일 and a 기념일 share — `hairline` on
 * `canvas`, with no hover or active state, because neither one opens anything.
 */
function StaticRow({ className, marker, label, caption }: StaticRowProps) {
  return (
    <li
      className={cn(
        "flex min-h-11 items-center gap-xs rounded-md border border-hairline bg-canvas px-md py-sm",
        className,
      )}
    >
      {marker}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-title-sm text-ink">{label}</span>
        <span className="block text-caption text-meta">{caption}</span>
      </span>
    </li>
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

  // WARN: Not enlargeable, unlike the chat row's. This sits inside the button that opens the event, where a nested `button` is invalid markup and would swallow the tap the row exists for.
  return (
    <Avatar
      className={cn("size-6 shrink-0", className)}
      name={participant.name}
      mediaId={participant.avatarMediaId}
    />
  );
}
