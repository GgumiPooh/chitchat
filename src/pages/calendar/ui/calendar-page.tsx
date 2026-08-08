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
  isDormant as isAppDormant,
  listMilestonesInRange,
  toDayKey,
  toMonthKey,
  type Maybe,
  type Nullable,
} from "@/shared/lib";
import { ActionSheet, AppHeader, Container, IconButton, toast } from "@/shared/ui";
import { CalendarMonth, toGridRange } from "@/widgets/calendar-month";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { DDayBand } from "./d-day-band";
import { DayEventsSheet } from "./day-events-sheet";
import { UpcomingCard } from "./upcoming-card";

export type CalendarPageProps = {
  className?: string;
  initialSummary: CalendarSummary;
  initialMonthKey: string;
  initialOccurrences: EventOccurrence[];
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
  initialDayKey,
}: CalendarPageProps) {
  const { participants, isDormant } = useChatStream();
  const [summary, setSummary] = useState(initialSummary);
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const [selectedDayKey, setSelectedDayKey] = useState<Nullable<string>>(initialDayKey ?? null);
  const [actioned, setActioned] = useState<Nullable<EventOccurrence>>(null);
  const [form, setForm] = useState<Nullable<FormState>>(null);
  // WARN: The month the server already rendered. Without this the mount effect refetches it immediately, replacing correct data with identical data and flashing the grid.
  const loadedMonthKey = useRef(initialMonthKey);
  // WARN: Two quick swipes leave two fetches in flight, and the slower one may land last. Without this counter it wins, and the grid keeps the previous month's dots while `loadedMonthKey` claims the fetch is done — the effect below has already run and will not re-run.
  const requestId = useRef(0);
  // INFO: REQUIREMENTS.md § 8.4.1. What the effect below compares against to catch the wake rather than the state.
  const wasDormant = useRef(false);
  const lastSummaryFetchAt = useRef(0);

  const reload = useCallback(async (nextMonthKey: string) => {
    requestId.current += 1;

    const id = requestId.current;
    const { from, to } = toGridRange(nextMonthKey);
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
   * WARN: § 8.4.1. Waking is not the only way back, which is why this is not hung
   * off dormancy alone. `isBusy` skips dormancy on a departure and
   * `IS_SSE_IDLE_SLEEP_ENABLED` disables it outright — under either, a return
   * produces no wake at all and the D-day would sit stale for the life of the page.
   */
  const refreshSummary = useCallback(() => {
    // INFO: § 8.4.1. Read from the module rather than the context boolean, because this callback is registered once and a reactive read would re-register both listeners on every wake.
    if (isAppDormant() || document.visibilityState !== "visible") {
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
    // WARN: The transition, never the value. This also runs on mount, where the summary is the one the server rendered and a refetch would be a request per visit.
    const hasWoken = wasDormant.current && !isDormant;

    wasDormant.current = isDormant;

    if (hasWoken) {
      refreshSummary();
    }
  }, [isDormant, refreshSummary]);

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
            onClick={() => openForm(selectedDayKey ?? summary.todayKey, null)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <Container className="space-y-md py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        <DDayBand summary={summary} />
        <UpcomingCard
          occurrences={summary.upcoming}
          todayKey={summary.todayKey}
          onSelect={selectDay}
        />
        <CalendarMonth
          monthKey={monthKey}
          startDate={summary.startDate}
          todayKey={summary.todayKey}
          selectedDayKey={selectedDayKey ?? ""}
          occurrences={occurrences}
          onMonthChange={setMonthKey}
          onSelectDay={selectDay}
        />
      </Container>

      <DayEventsSheet
        isOpen={selectedDayKey !== null}
        dayKey={selectedDayKey ?? summary.todayKey}
        occurrences={selectedDayKey ? occurrencesOn(occurrences, selectedDayKey) : []}
        participants={participants}
        milestones={
          selectedDayKey
            ? listMilestonesInRange(summary.startDate, selectedDayKey, selectedDayKey)
            : []
        }
        onClose={() => setSelectedDayKey(null)}
        onCreate={() => openForm(selectedDayKey ?? summary.todayKey, null)}
        onSelect={openActions}
      />

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
   * see the grid range currently loaded — selecting outside it would open the sheet
   * on `이 날은 일정이 없어요` for a day the card just said had an event.
   */
  function selectDay(dayKey: string) {
    setMonthKey(toMonthKey(dayKey));
    setSelectedDayKey(dayKey);
  }

  /**
   * WARN: The day sheet closes first. Both are modal `Drawer`s portalled to `body`
   * and neither is declared nested, so leaving it up means two focus traps and two
   * overlays — and dismissing the top one restores `pointer-events` in a way that
   * can leave the one underneath inert.
   */
  function openActions(occurrence: EventOccurrence) {
    setSelectedDayKey(null);
    setActioned(occurrence);
  }

  // WARN: Both sheets are closed first, for the reason `openActions` gives.
  function openForm(dayKey: string, occurrence: Nullable<EventOccurrence>) {
    setActioned(null);
    setSelectedDayKey(null);
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
