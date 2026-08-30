"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { EventDetailDialog } from "@/features/manage-event";
import type { CalendarSnapshot } from "@/features/offline-snapshot";
import {
  findHoliday,
  formatDateWithWeekday,
  listMilestonesInRange,
  occursOnDay,
  parseDayKey,
  toDayKey,
  toMonthKey,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, OFFLINE_NOTICE_ID } from "@/shared/offline-ux";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container, EmptyState, IconButton, toast, TwoPane } from "@/shared/ui";
import {
  AgendaEventRow,
  AgendaStaticRow,
  CalendarMonth,
  HolidayDot,
  MilestoneDot,
  UPCOMING_HEADING_ID,
  UpcomingEmptyRow,
  UpcomingEventRow,
  UpcomingSection,
} from "@/widgets/calendar-month";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { CalendarDays, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { MirrorLoading } from "./mirror-loading";

export type MirrorCalendarProps = {
  className?: string;
  /** REQUIREMENTS.md § 11.4. For the authorship line; empty when the shell was never received. */
  participants: Participant[];
};

/**
 * 캘린더 as it was last received (REQUIREMENTS.md § 16.2.) — the same order the
 * live screen keeps, 다가오는 일정 above the grid and the day's agenda under it,
 * minus the D-day band and minus every write.
 *
 * WARN: No D-day band. REQUIREMENTS.md § 11.1. resolves that count on the server so
 * both users see one number whatever their device clock says, and a cached one is a
 * number nobody agreed on — the stale stamp carries the honesty instead.
 */
export function MirrorCalendar({ className, participants }: MirrorCalendarProps) {
  const snapshot = useSnapshot<CalendarSnapshot>("calendar");
  // INFO: § 11.3. A day is always selected; the snapshot's own day is the fallback until the reader picks another.
  const [pickedDayKey, setPickedDayKey] = useState<Nullable<string>>(null);
  const [detailed, setDetailed] = useState<Nullable<EventOccurrence>>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // WARN: The device's own day, never the snapshot's `todayKey`. Which cell is today and how far off an event is are questions this device can answer on its own; § 11.1.'s D-day — the number that has to agree across two devices — is the one withheld.
  // INFO: Read once at mount, like the live screen's `toNewDraft` — a re-render must not move today under the reader.
  const [todayKey] = useState(() => toDayKey(Date.now()));

  return (
    <TwoPane
      className={className}
      // INFO: AGENTS.md § 4.1. `lg`'s own copy of the grid, sharing the state and handlers the mobile stack below uses — the D-day band above it live is withheld here (see the WARN above).
      panel={
        <div className="flex flex-col gap-md p-md">
          {snapshot.status === "loading" && <MirrorLoading variant="calendar" />}
          {snapshot.status === "hit" && renderGrid(snapshot.payload)}
        </div>
      }
    >
      <AppHeader
        hasSidePanel
        title="캘린더"
        // INFO: DESIGN.md § 7.19. Drawn and refusing rather than withdrawn — a write, so it refuses in the handler.
        trailing={
          <IconButton
            variant="floating"
            Icon={Plus}
            haptic
            aria-label="일정 추가"
            aria-disabled
            aria-describedby={OFFLINE_NOTICE_ID}
            onClick={() => toast(OFFLINE_MESSAGES.add)}
          />
        }
      />
      <Container className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-[var(--bottom-inset,0px)]">
        {snapshot.status === "loading" && <MirrorLoading />}
        {snapshot.status === "miss" && <SnapshotEmpty Icon={CalendarDays} subject="일정" />}
        {snapshot.status === "hit" && renderMonth(snapshot.payload, snapshot.savedAt)}
      </Container>
      {/* INFO: § 16.2. Reading is the whole of what the mirror offers, so the dialog opens without its 일정 관리 — a control that could only refuse. */}
      <EventDetailDialog
        occurrence={detailed}
        participants={participants}
        isReadOnly
        onClose={() => setDetailed(null)}
        onChanged={() => undefined}
      />
    </TwoPane>
  );

  function renderGrid(payload: CalendarSnapshot) {
    return (
      <CalendarMonth
        monthKey={payload.monthKey}
        startDate={payload.summary.startDate}
        todayKey={todayKey}
        selectedDayKey={pickedDayKey ?? payload.summary.todayKey}
        occurrences={payload.occurrences}
        holidays={payload.holidays}
        // WARN: The snapshot holds one grid range, so another month has no markers to draw rather than none to show — the swipe says so instead of quietly drawing an empty August.
        onMonthChange={() => toast(OFFLINE_MESSAGES.view)}
        onSelectDay={setPickedDayKey}
      />
    );
  }

  function renderMonth(payload: CalendarSnapshot, savedAt: number) {
    const dayKey = pickedDayKey ?? payload.summary.todayKey;
    const holiday = findHoliday(dayKey, payload.holidays);
    const milestones = listMilestonesInRange(payload.summary.startDate, dayKey, dayKey);
    const occurrences = payload.occurrences.filter((occurrence) => occursOnDay(occurrence, dayKey));
    const isEmpty = holiday === null && milestones.length === 0 && occurrences.length === 0;

    return (
      <>
        <SnapshotStamp savedAt={savedAt} />
        <UpcomingSection>
          {payload.summary.upcoming.length === 0 ? (
            <UpcomingEmptyRow />
          ) : (
            // INFO: Every row the snapshot holds and no 더 보기 — the next page is a request, and § 16.2. refuses a request before it can only fail.
            <ul className="divide-y divide-hairline" aria-labelledby={UPCOMING_HEADING_ID}>
              {payload.summary.upcoming.map((occurrence) => (
                <UpcomingEventRow
                  key={occurrence.event.id + occurrence.startsAt}
                  occurrence={occurrence}
                  todayKey={todayKey}
                  onSelect={(targetDayKey) => selectDayFromUpcoming(targetDayKey, payload.monthKey)}
                />
              ))}
            </ul>
          )}
        </UpcomingSection>
        {/* INFO: AGENTS.md § 4.1. The panel above takes over at `lg`; this drops out. */}
        {/* INFO: DESIGN.md § 7.9. `scroll-mt` is what makes `scrollIntoView` clear the floating header (§ 7.12.) rather than parking the first week under it. */}
        <div className="lg:hidden">
          <div ref={gridRef} className="scroll-mt-(--app-header-inset)">
            {renderGrid(payload)}
          </div>
        </div>
        <section className="space-y-xs" aria-label="선택한 날의 일정">
          <h2 className="text-title-md text-ink" aria-live="polite">
            {formatDateWithWeekday(parseDayKey(dayKey))}
          </h2>
          {isEmpty ? (
            <EmptyState Icon={CalendarDays} description="이 날은 일정이 없어요" />
          ) : (
            <ul className="space-y-2xs">
              {holiday && (
                <AgendaStaticRow
                  caption={holiday.isSubstitute ? "대체공휴일" : "공휴일"}
                  label={holiday.name}
                  marker={<HolidayDot />}
                />
              )}
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
                  onSelect={setDetailed}
                />
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  // WARN: The grid cannot leave the snapshot's month, so a row pointing outside it says so rather than selecting a day the grid below cannot show.
  function selectDayFromUpcoming(targetDayKey: string, monthKey: string) {
    if (toMonthKey(targetDayKey) !== monthKey) {
      toast(OFFLINE_MESSAGES.view);

      return;
    }

    setPickedDayKey(targetDayKey);
    // INFO: DESIGN.md § 7.9. The answer to "when is that again" is the month directly below the row, and this section can push it off the fold.
    gridRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }
}
