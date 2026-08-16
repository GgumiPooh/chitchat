"use client";

import type { CalendarSnapshot } from "@/features/offline-snapshot";
import {
  cn,
  findHoliday,
  formatDateWithWeekday,
  formatMultiDaySpan,
  formatOccurrenceTime,
  listMilestonesInRange,
  occursOnDay,
  parseDayKey,
  toDayKey,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container, EmptyState, toast } from "@/shared/ui";
import { CalendarMonth, HolidayDot, MilestoneDot } from "@/widgets/calendar-month";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { CalendarDays } from "lucide-react";
import { useState, type ReactNode } from "react";
import { MirrorLoading } from "./mirror-loading";

export type MirrorCalendarProps = {
  className?: string;
};

/**
 * 캘린더 as it was last received (REQUIREMENTS.md § 16.).
 *
 * WARN: No D-day band. REQUIREMENTS.md § 11.1. resolves that count on the server so
 * both users see one number whatever their device clock says, and a cached one is a
 * number nobody agreed on — the stale stamp carries the honesty instead.
 */
export function MirrorCalendar({ className }: MirrorCalendarProps) {
  const snapshot = useSnapshot<CalendarSnapshot>("calendar");
  // INFO: § 11.3. A day is always selected; the snapshot's own day is the fallback until the reader picks another.
  const [pickedDayKey, setPickedDayKey] = useState<Nullable<string>>(null);

  return (
    <div className={className}>
      <AppHeader title="캘린더" />
      <Container className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-[var(--bottom-inset,0px)]">
        {snapshot.status === "loading" && <MirrorLoading />}
        {snapshot.status === "miss" && <SnapshotEmpty Icon={CalendarDays} subject="일정" />}
        {snapshot.status === "hit" && renderMonth(snapshot.payload, snapshot.savedAt)}
      </Container>
    </div>
  );

  function renderMonth(payload: CalendarSnapshot, savedAt: number) {
    const dayKey = pickedDayKey ?? payload.summary.todayKey;
    const holiday = findHoliday(dayKey, payload.holidays);
    const milestones = listMilestonesInRange(payload.summary.startDate, dayKey, dayKey);
    const occurrences = payload.occurrences.filter((occurrence) => occursOnDay(occurrence, dayKey));
    const isEmpty = holiday === null && milestones.length === 0 && occurrences.length === 0;

    return (
      <>
        <SnapshotStamp savedAt={savedAt} />
        <CalendarMonth
          monthKey={payload.monthKey}
          startDate={payload.summary.startDate}
          // WARN: The device's own day, never the snapshot's `todayKey`. Which cell is today is a question this device can answer on its own; § 11.1.'s D-day — the number that has to agree across two devices — is the one withheld.
          todayKey={toDayKey(Date.now())}
          selectedDayKey={dayKey}
          occurrences={payload.occurrences}
          holidays={payload.holidays}
          // WARN: The snapshot holds one grid range, so another month has no markers to draw rather than none to show — the swipe says so instead of quietly drawing an empty August.
          onMonthChange={() => toast(OFFLINE_MESSAGES.view)}
          onSelectDay={setPickedDayKey}
        />
        <section className="space-y-xs" aria-label="선택한 날의 일정">
          <h2 className="text-title-md text-ink" aria-live="polite">
            {formatDateWithWeekday(parseDayKey(dayKey))}
          </h2>
          {isEmpty ? (
            <EmptyState Icon={CalendarDays} description="이 날은 일정이 없어요" />
          ) : (
            <ul className="space-y-2xs">
              {holiday && (
                <MirrorAgendaRow
                  caption={holiday.isSubstitute ? "대체공휴일" : "공휴일"}
                  label={holiday.name}
                  marker={<HolidayDot />}
                />
              )}
              {milestones.map((milestone) => (
                <MirrorAgendaRow
                  key={milestone.dayKey + milestone.label}
                  caption="기념일"
                  label={milestone.label}
                  marker={<MilestoneDot />}
                />
              ))}
              {occurrences.map((occurrence) => (
                <MirrorAgendaRow
                  key={occurrence.event.id + occurrence.startsAt}
                  caption={formatOccurrenceTime(occurrence, dayKey)}
                  label={occurrence.event.title}
                  // INFO: § 11.3. A multi-day event names its span, since the heading above only ever states the selected day.
                  description={formatMultiDaySpan(occurrence)}
                />
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }
}

type MirrorAgendaRowProps = {
  className?: string;
  caption: string;
  label: string;
  description?: Nullable<string>;
  marker?: ReactNode;
};

// INFO: § 11.4. A row and never a button — the mirror offers no 수정 and no 삭제 for one to open.
function MirrorAgendaRow({ className, caption, label, description, marker }: MirrorAgendaRowProps) {
  return (
    <li
      className={cn(
        "flex min-h-11 items-center gap-xs rounded-md bg-surface-soft px-sm py-xs",
        className,
      )}
    >
      {marker}
      <span className="shrink-0 text-caption text-meta">{caption}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-md text-ink">{label}</span>
        {description && <span className="truncate text-caption text-meta">{description}</span>}
      </span>
    </li>
  );
}
