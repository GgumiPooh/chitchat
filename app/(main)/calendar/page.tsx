import { getCalendarSummary, listEventOccurrences } from "@/entities/event";
import { CalendarPage } from "@/pages/calendar";
import { encryptServerPayload, requireUserOrRedirect } from "@/shared/auth";
import { CALENDAR_DAY_PARAM, MAX_UPCOMING_EVENTS } from "@/shared/config";
import { loadHolidays } from "@/shared/holiday";
import { isDayKey, toMonthKey, type Maybe } from "@/shared/lib";
import { toGridRange } from "@/widgets/calendar-month";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

/**
 * REQUIREMENTS.md § 11.1. The D-day is resolved here, in a Server Component, so
 * both users see the same number whatever their device clock says.
 */
export default async function Page({ searchParams }: PageProps) {
  await requireUserOrRedirect();

  // INFO: § 11.5. A chat system notice taps through carrying the event's day, so the screen opens on that month with that day selected in the agenda instead of today (§ 11.3.).
  // WARN: Shape-checked, not merely typed. `?day=` or `?day=abc` reaches every date helper below as an Invalid Date, and `Intl.DateTimeFormat.format` throws on one — an unvalidated param is a 500 on a URL anybody can type.
  const dayParam = (await searchParams)[CALENDAR_DAY_PARAM];
  const dayKey = isDayKey(dayParam) ? dayParam : undefined;
  // INFO: § 11.7. Together rather than in sequence — `loadHolidays` reaches a government gateway behind a timeout, which belongs inside the summary query's wait rather than after it.
  // WARN: § 11.5.1. One past what the section draws, so 더 보기 is on screen from the first paint rather than appearing at the first focus refresh.
  const [summary, holidays] = await Promise.all([
    getCalendarSummary(MAX_UPCOMING_EVENTS + 1),
    loadHolidays(),
  ]);
  const monthKey = toMonthKey(dayKey ?? summary.todayKey);
  const { from, to } = toGridRange(monthKey);
  const occurrences = await listEventOccurrences(from, to);

  const encryptedPayload = await encryptServerPayload({
    initialSummary: summary,
    initialMonthKey: monthKey,
    initialOccurrences: occurrences,
    holidays,
    initialDayKey: dayKey,
  });

  return <CalendarPage encryptedPayload={encryptedPayload} />;
}
