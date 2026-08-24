"use client";

import type { CalendarSummary, EventOccurrence } from "@/entities/event";
import { useChatStream } from "@/features/chat-stream";
import {
  EventDetailDialog,
  EventFormSheet,
  fetchCalendarSummary,
  fetchOccurrences,
} from "@/features/manage-event";
import { useWriteCalendarSnapshot } from "@/features/offline-snapshot";
import {
  MAX_UPCOMING_EVENTS,
  SSE_SYNC_COALESCE_WINDOW,
  UPCOMING_EVENTS_CEILING,
  UPCOMING_EVENTS_PAGE_SIZE,
} from "@/shared/config";
import {
  cn,
  findHoliday,
  listMilestonesInRange,
  occursOnDay,
  toMonthKey,
  toMonthStart,
  type HolidayTable,
  type Maybe,
  type Nullable,
} from "@/shared/lib";
import { AppHeader, Container, IconButton, toast } from "@/shared/ui";
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

// INFO: REQUIREMENTS.md § 11.4. Creating only — an edit is opened from `EventDetailDialog`, which owns the occurrence it is editing.
type FormState = {
  dayKey: string;
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
  // INFO: REQUIREMENTS.md § 16. The loaded month, whichever it is — a mirror labels it stale rather than pretending it is this one.
  useWriteCalendarSnapshot({ summary, monthKey, occurrences, holidays });
  // INFO: § 11.3. A day is always selected, because the agenda under the grid always has one to show — `null` used to mean "no sheet up" and there is no sheet any more.
  const [selectedDayKey, setSelectedDayKey] = useState(initialDayKey ?? initialSummary.todayKey);
  // INFO: The agenda asserts `이 날은 일정이 없어요`, so it must be able to say "not yet" instead — a month still in flight is not an empty day.
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  // INFO: REQUIREMENTS.md § 11.4. The row opens the event rather than a menu about it; 수정 and 삭제 live behind the dialog's own control.
  const [detailed, setDetailed] = useState<Nullable<EventOccurrence>>(null);
  const [form, setForm] = useState<Nullable<FormState>>(null);
  // INFO: REQUIREMENTS.md § 11.5.1. 더 보기 widens the page the summary is asked for; the extra row every request adds is what says whether another page exists.
  const [upcomingLimit, setUpcomingLimit] = useState(MAX_UPCOMING_EVENTS);
  const [isExpandingUpcoming, setIsExpandingUpcoming] = useState(false);
  // WARN: A ref beside the state, because the month reload and the focus refresh fetch the summary too and must ask for the page the reader is on — keyed on `upcomingLimit` instead, the month effect would refetch the grid on every 더 보기.
  const loadedUpcomingLimit = useRef(MAX_UPCOMING_EVENTS);
  const gridRef = useRef<HTMLDivElement>(null);
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
        fetchCalendarSummary(loadedUpcomingLimit.current + 1),
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

  // WARN: The mount is skipped through `loadedUpcomingLimit`, because the server render already answered for the first page — without it arriving on 캘린더 spends a request re-fetching what the HTML came with.
  useEffect(() => {
    if (upcomingLimit === loadedUpcomingLimit.current) {
      return;
    }

    loadedUpcomingLimit.current = upcomingLimit;

    void fetchCalendarSummary(upcomingLimit + 1)
      .then(setSummary)
      .catch(() => toast.error("일정을 불러오지 못했어요"))
      .finally(() => setIsExpandingUpcoming(false));
  }, [upcomingLimit]);

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

    void fetchCalendarSummary(loadedUpcomingLimit.current + 1)
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

  // WARN: `isExpandingUpcoming` holds the button on screen. The limit steps on the press and the page lands a round trip later, so the summary in hand is briefly one page short (REQUIREMENTS.md § 11.5.1.).
  const hasMoreUpcoming =
    isExpandingUpcoming ||
    (upcomingLimit < UPCOMING_EVENTS_CEILING && summary.upcoming.length > upcomingLimit);

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
            onClick={() => openForm(selectedDayKey)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <Container className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        <DDayBand summary={summary} />
        {/* INFO: DESIGN.md § 7.9. Under the band and above the grid, which is affordable because the list is capped and always drawn — it no longer varies between nothing and three rows. */}
        <UpcomingCard
          occurrences={summary.upcoming.slice(0, upcomingLimit)}
          todayKey={summary.todayKey}
          hasMore={hasMoreUpcoming}
          isLoadingMore={isExpandingUpcoming}
          onLoadMore={expandUpcoming}
          onSelect={selectDayFromUpcoming}
        />
        {/* INFO: DESIGN.md § 7.9. `scroll-mt` is what makes `scrollIntoView` clear the floating header (§ 7.12.) rather than parking the first week under it. */}
        <div ref={gridRef} className="scroll-mt-(--app-header-inset)">
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
        </div>
        <DayAgenda
          dayKey={selectedDayKey}
          isLoading={isLoadingMonth}
          holiday={findHoliday(selectedDayKey, holidays)}
          milestones={listMilestonesInRange(summary.startDate, selectedDayKey, selectedDayKey)}
          occurrences={occurrences.filter((occurrence) => occursOnDay(occurrence, selectedDayKey))}
          participants={participants}
          onCreate={() => openForm(selectedDayKey)}
          onSelect={setDetailed}
        />
      </Container>

      <EventDetailDialog
        occurrence={detailed}
        participants={participants}
        onClose={() => setDetailed(null)}
        onChanged={() => void reloadCurrent()}
      />

      {form && (
        <EventFormSheet
          key={form.token}
          isOpen
          dayKey={form.dayKey}
          occurrence={null}
          onClose={() => setForm(null)}
          onSaved={() => void reloadCurrent()}
        />
      )}
    </div>
  );

  /**
   * WARN: The month follows the day. The upcoming card reaches a year ahead and an
   * adjacent-month cell reaches one month either way, while the agenda's own filter can
   * only see the grid range currently loaded — selecting outside it would leave the agenda
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

  /**
   * REQUIREMENTS.md § 11.5. The row's answer is the grid, which is directly below it —
   * so the screen scrolls the month to the top rather than leaving the reader to find
   * the day they just selected.
   */
  function selectDayFromUpcoming(dayKey: string) {
    selectDay(dayKey);
    // INFO: DESIGN.md § 4.7. Reduced motion keeps the destination and drops the travel.
    gridRef.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function expandUpcoming() {
    // WARN: Raised **here** and not in the effect that follows, so it batches with the step. Set a commit later, the render in between has a stepped limit under a summary that has not caught up, and 더 보기 blinks out under the finger.
    setIsExpandingUpcoming(true);
    setUpcomingLimit((current) => current + UPCOMING_EVENTS_PAGE_SIZE);
  }

  function openForm(dayKey: string) {
    setForm((previous) => ({ dayKey, token: (previous?.token ?? 0) + 1 }));
  }

  async function reloadCurrent() {
    try {
      await reload(monthKey);
    } catch {
      toast.error("일정을 불러오지 못했어요");
    }
  }
}
