"use client";

import type { CalendarSummary, EventOccurrence } from "@/entities/event";
import { useChatStream } from "@/features/chat-stream";
import {
  deleteEvent,
  EventFormSheet,
  fetchCalendarSummary,
  fetchOccurrences,
} from "@/features/manage-event";
import { SSE_SYNC_COALESCE_WINDOW } from "@/shared/config";
import {
  cn,
  findHoliday,
  listMilestonesInRange,
  toDayKey,
  toMonthKey,
  toMonthStart,
  type HolidayTable,
  type Maybe,
  type Nullable,
} from "@/shared/lib";
import { ActionSheet, AppHeader, Container, IconButton, toast } from "@/shared/ui";
import { CalendarMonth, toGridRange } from "@/widgets/calendar-month";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DDayBand } from "./d-day-band";
import { DayAgenda } from "./day-agenda";
import { UpcomingCard } from "./upcoming-card";

export type CalendarPageProps = {
  className?: string;
  initialSummary: CalendarSummary;
  initialMonthKey: string;
  initialOccurrences: EventOccurrence[];
  /** REQUIREMENTS.md § 11.7. Every year at once, because a swipe resolves its 빨간 날 without asking for anything. */
  holidays: HolidayTable;
  /** REQUIREMENTS.md § 11.5. The day a chat system notice tapped through to, if any. */
  initialDayKey: Maybe<string>;
};

type FormState = {
  dayKey: string;
  occurrence: Nullable<EventOccurrence>;
  /** Bumped per opening, because `EventFormSheet` seeds its draft once — at mount. */
  token: number;
};

export function CalendarPage({
  className,
  initialSummary,
  initialMonthKey,
  initialOccurrences,
  holidays,
  initialDayKey,
}: CalendarPageProps) {
  const { participants } = useChatStream();
  const [summary, setSummary] = useState(initialSummary);
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  // INFO: § 11.3. A day is always selected, because the agenda under the grid always has one to show — `null` used to mean "no sheet up" and there is no sheet any more.
  const [selectedDayKey, setSelectedDayKey] = useState(initialDayKey ?? initialSummary.todayKey);
  // INFO: The agenda asserts `이 날은 일정이 없어요`, so it must be able to say "not yet" instead — a month still in flight is not an empty day.
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [actioned, setActioned] = useState<Nullable<EventOccurrence>>(null);
  const [form, setForm] = useState<Nullable<FormState>>(null);
  // WARN: The month the server already rendered. Without this the mount effect refetches it immediately, replacing correct data with identical data and flashing the grid.
  const loadedMonthKey = useRef(initialMonthKey);
  // WARN: Two quick swipes leave two fetches in flight, and the slower one may land last. Without this counter it wins, and the grid keeps the previous month's dots while `loadedMonthKey` claims the fetch is done — the effect below has already run and will not re-run.
  const requestId = useRef(0);
  const lastSummaryFetchAt = useRef(0);

  const reload = useCallback(async (nextMonthKey: string) => {
    requestId.current += 1;

    const id = requestId.current;
    const { from, to } = toGridRange(nextMonthKey);

    setIsLoadingMonth(true);

    try {
      const [nextOccurrences, nextSummary] = await Promise.all([
        fetchOccurrences(from, to),
        fetchCalendarSummary(),
      ]);

      if (id !== requestId.current) {
        return;
      }

      loadedMonthKey.current = nextMonthKey;
      setOccurrences(nextOccurrences);
      setSummary(nextSummary);
    } finally {
      // WARN: Only the newest request may clear the flag, or a slow first fetch landing after a fast second one uncovers the agenda while the month it is showing is still in flight.
      if (id === requestId.current) {
        setIsLoadingMonth(false);
      }
    }
  }, []);

  useEffect(() => {
    if (monthKey !== loadedMonthKey.current) {
      void reload(monthKey).catch(() => toast.error("일정을 불러오지 못했어요"));
    }
  }, [monthKey, reload]);

  /**
   * REQUIREMENTS.md § 11.1. Recomputed when the app comes back, so one left open
   * across midnight stops showing yesterday's D-day. The count is the server's,
   * never recomputed here.
   *
   * INFO: § 8.4.1. The return is the whole trigger, with no dormancy beside it —
   * this screen holds no stream, so it never sleeps and the gate is never shut
   * under it.
   */
  const refreshSummary = useCallback(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    const now = Date.now();

    // WARN: § 8.4. Coalesced for the same reason the stream's catch-up is: a desktop window raised from behind another fires `focus` and `visibilitychange` for one return, and this used to spend two summary requests on it.
    if (now - lastSummaryFetchAt.current < SSE_SYNC_COALESCE_WINDOW) {
      return;
    }

    lastSummaryFetchAt.current = now;

    void fetchCalendarSummary()
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    document.addEventListener("visibilitychange", refreshSummary);
    window.addEventListener("focus", refreshSummary);

    return () => {
      document.removeEventListener("visibilitychange", refreshSummary);
      window.removeEventListener("focus", refreshSummary);
    };
  }, [refreshSummary]);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="캘린더"
        trailing={
          <IconButton
            variant="floating"
            Icon={Plus}
            haptic
            aria-label="일정 추가"
            onClick={() => openForm(selectedDayKey, null)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <Container className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        <DDayBand summary={summary} />
        <CalendarMonth
          monthKey={monthKey}
          startDate={summary.startDate}
          todayKey={summary.todayKey}
          selectedDayKey={selectedDayKey}
          occurrences={occurrences}
          holidays={holidays}
          onMonthChange={changeMonth}
          onSelectDay={selectDay}
        />
        <DayAgenda
          dayKey={selectedDayKey}
          isLoading={isLoadingMonth}
          holiday={findHoliday(selectedDayKey, holidays)}
          milestones={listMilestonesInRange(summary.startDate, selectedDayKey, selectedDayKey)}
          occurrences={occurrencesOn(occurrences, selectedDayKey)}
          participants={participants}
          onCreate={() => openForm(selectedDayKey, null)}
          onSelect={openActions}
        />
        {/* WARN: DESIGN.md § 7.9. Last, and never above the grid. It is the one section here whose height is the event count, so between the band and the grid it moved the month under the thumb — day to day, and again on every add or delete. Nothing follows it, so it may now arrive at whatever height it likes. */}
        <UpcomingCard
          occurrences={summary.upcoming}
          todayKey={summary.todayKey}
          onSelect={selectDay}
        />
      </Container>

      {/* INFO: REQUIREMENTS.md § 11.4. No permission tier — 수정 and 삭제 are offered on every event, whoever created it. */}
      <ActionSheet
        isOpen={actioned !== null}
        header={{ title: actioned?.event.title ?? "일정", isHidden: true }}
        items={[
          {
            label: "수정",
            onSelect: () => actioned && openForm(startDayKeyOf(actioned), actioned),
          },
          { label: "삭제", variant: "destructive", onSelect: () => void remove(actioned) },
        ]}
        onClose={() => setActioned(null)}
      />

      {form && (
        <EventFormSheet
          key={form.token}
          isOpen
          dayKey={form.dayKey}
          occurrence={form.occurrence}
          onClose={() => setForm(null)}
          onSaved={() => void reloadCurrent()}
        />
      )}
    </div>
  );

  /**
   * WARN: The month follows the day. The upcoming card reaches a year ahead and an
   * adjacent-month cell reaches one month either way, while `occurrencesOn` can only
   * see the grid range currently loaded — selecting outside it would leave the agenda
   * on `이 날은 일정이 없어요` for a day the card just said had an event.
   */
  function selectDay(dayKey: string) {
    setMonthKey(toMonthKey(dayKey));
    setSelectedDayKey(dayKey);
  }

  /**
   * WARN: The selection follows the month, and it is the **grid's** range that
   * decides — not the month's. The grid's edge rows carry a week either side and
   * their markers are fetched with it, so a selection there is still on screen and
   * still loaded; dropping it on `toMonthKey` alone discarded 8월 31일 for 9월 1일
   * while 8월 31일 was sitting in the row above.
   */
  function changeMonth(nextMonthKey: string) {
    const { from, to } = toGridRange(nextMonthKey);

    setMonthKey(nextMonthKey);
    setSelectedDayKey((current) => {
      if (current >= from && current <= to) {
        return current;
      }

      // INFO: Today rather than the 1st when the swipe lands on this month, so coming back selects the day the screen opened on.
      return nextMonthKey === toMonthKey(summary.todayKey)
        ? summary.todayKey
        : toMonthStart(nextMonthKey);
    });
  }

  function openActions(occurrence: EventOccurrence) {
    setActioned(occurrence);
  }

  // WARN: The action sheet closes first. Both are modal `Drawer`s portalled to `body` and neither is declared nested, so leaving it up means two focus traps — and dismissing the top one can leave the one underneath inert.
  function openForm(dayKey: string, occurrence: Nullable<EventOccurrence>) {
    setActioned(null);
    setForm((previous) => ({ dayKey, occurrence, token: (previous?.token ?? 0) + 1 }));
  }

  async function reloadCurrent() {
    try {
      await reload(monthKey);
    } catch {
      toast.error("일정을 불러오지 못했어요");
    }
  }

  async function remove(occurrence: Nullable<EventOccurrence>) {
    if (!occurrence) {
      return;
    }

    setActioned(null);

    try {
      await deleteEvent(occurrence.event.id);
      await reloadCurrent();
    } catch {
      toast.error("일정을 삭제하지 못했어요");
    }
  }
}

// INFO: A multi-day event belongs to every day it covers, so the sheet cannot filter on its start alone.
function occurrencesOn(occurrences: EventOccurrence[], dayKey: string): EventOccurrence[] {
  return occurrences.filter(
    (occurrence) => startDayKeyOf(occurrence) <= dayKey && toDayKey(occurrence.endsAt) >= dayKey,
  );
}

function startDayKeyOf(occurrence: EventOccurrence): string {
  return toDayKey(occurrence.startsAt);
}
