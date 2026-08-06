"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import {
  cn,
  formatDateWithWeekday,
  parseDayKey,
  type Milestone,
  type Optional,
} from "@/shared/lib";
import { Avatar, BottomSheet, Button, EmptyState, HapticTap } from "@/shared/ui";
import { EventDot, MilestoneDot } from "@/widgets/calendar-month";
import { CalendarDays } from "lucide-react";
import { formatOccurrenceTime } from "../model/format-event";

export type DayEventsSheetProps = {
  className?: string;
  isOpen: boolean;
  dayKey: string;
  occurrences: EventOccurrence[];
  /** REQUIREMENTS.md § 11.2. Derived, so they are listed but never editable. */
  milestones: Milestone[];
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
  milestones,
  participants,
  onClose,
  onCreate,
  onSelect,
}: DayEventsSheetProps) {
  const isEmpty = occurrences.length === 0 && milestones.length === 0;

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{ title: formatDateWithWeekday(parseDayKey(dayKey)) }}
      onClose={onClose}
    >
      <div className="space-y-sm">
        {isEmpty ? (
          // INFO: REQUIREMENTS.md § 11.5. A day with nothing on it still gets a state of its own rather than a bare gap above the button.
          <EmptyState Icon={CalendarDays} description="이 날은 일정이 없어요" />
        ) : (
          <ul className="space-y-2xs">
            {/* INFO: REQUIREMENTS.md § 11.2. Listed first, and without the empty state a milestone-only day would otherwise get — the grid marked the day, so the sheet must say what marked it. */}
            {milestones.map((milestone) => (
              <li
                key={milestone.dayKey + milestone.label}
                className="flex min-h-11 items-center gap-xs rounded-md border border-hairline bg-canvas px-md py-sm"
              >
                <MilestoneDot />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-title-sm text-ink">{milestone.label}</span>
                  <span className="block text-caption text-meta">기념일</span>
                </span>
              </li>
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
                    <span className="block text-caption text-meta">
                      {formatOccurrenceTime(occurrence)}
                    </span>
                  </span>
                  {/* INFO: REQUIREMENTS.md § 11.4. Authorship is shown, never enforced — either user may edit any event. */}
                  <Author
                    participant={participants.find(({ id }) => id === occurrence.event.createdBy)}
                  />
                </button>
                {/* WARN: `keepsScroll` — the row fills the sheet, so a finger scrolling the list or pulling the sheet down lands here, and the switch would keep that drag and end it as a tap on the event (`DESIGN.md § 7.15.1.`). */}
                <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
              </li>
            ))}
          </ul>
        )}
        <Button haptic onClick={onCreate}>
          일정 추가
        </Button>
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

  // WARN: Not enlargeable, unlike the chat row's. This sits inside the button that opens the event, where a nested `button` is invalid markup and would swallow the tap the row exists for.
  return (
    <Avatar
      className={cn("size-6 shrink-0", className)}
      name={participant.name}
      mediaId={participant.avatarMediaId}
    />
  );
}
