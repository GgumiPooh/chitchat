import { A_DAY, parseDayKey, TIME_ZONE_OFFSET_MS } from "./time";

export type EventRecurrence = "none" | "weekly" | "monthly" | "yearly";

export type RecurrenceSpan = { startsAt: string; endsAt: string };

export type RecurringSpan = RecurrenceSpan & { recurrence: EventRecurrence };

/**
 * REQUIREMENTS.md § 6. Every projection of a row onto the periods a day-key range
 * touches — widened by a period on each side, so the caller filters by overlap.
 *
 * INFO: Three fixed cadences by design — never introduce RRULE here. That is also
 * why each projection is a loop over a handful of periods rather than a rule engine.
 */
export function projectRecurrence(
  row: RecurringSpan,
  fromKey: string,
  toKey: string,
): RecurrenceSpan[] {
  switch (row.recurrence) {
    case "yearly":
      return projectYearly(row, fromKey, toKey);
    case "monthly":
      return projectMonthly(row, fromKey, toKey);
    case "weekly":
      return projectWeekly(row, fromKey, toKey);
    default:
      return [{ startsAt: row.startsAt, endsAt: row.endsAt }];
  }
}

/**
 * WARN: The duration is carried across rather than the end date being rebuilt
 * from its own fields — a 12월 31일 → 1월 1일 event would otherwise project onto
 * a year where its end lands before its start.
 *
 * WARN: `listUpcomingOccurrences` (`entities/event`) encodes this same rule in SQL, because a `LIMIT`
 * needs the sort key in the database — change one and change both. That copy exists
 * only because a range spanning a year boundary is what makes this one a loop.
 */
function projectYearly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchorStart = new Date(row.startsAt);
  const duration = Date.parse(row.endsAt) - Date.parse(row.startsAt);
  // INFO: A year wider on each side than the range asks for, because the anchor is an instant and `TIME_ZONE` is ahead of UTC — an event just after midnight belongs to the next calendar year from the projection's point of view. `overlaps` drops whatever the widening let through.
  const fromYear = parseDayKey(fromKey).getUTCFullYear() - 1;
  const toYear = parseDayKey(toKey).getUTCFullYear() + 1;
  const occurrences: RecurrenceSpan[] = [];

  for (let year = fromYear; year <= toYear; year += 1) {
    const startsAt = new Date(anchorStart);

    startsAt.setUTCFullYear(year);

    occurrences.push(toSpan(startsAt.getTime(), duration));
  }

  return occurrences;
}

/**
 * REQUIREMENTS.md § 11.4. The anchor's day of month, clamped to the last day of a
 * shorter month, in `TIME_ZONE` wall-clock — a 31일 event lands on 2월 28일.
 *
 * WARN: Unlike `projectYearly`, this works in wall-clock and never UTC: an event at
 * 08:00 KST is the previous UTC day, so clamping the UTC day would move it a day.
 * `listUpcomingOccurrences` (`entities/event`) encodes the same rule in SQL — change one and change both.
 *
 * INFO: Never before the anchor, unlike `yearly` — a monthly bill starting in 12월 has no 11월.
 */
function projectMonthly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchor = toWallClock(row.startsAt);
  const duration = Date.parse(row.endsAt) - Date.parse(row.startsAt);
  const anchorMonth = toMonthIndex(anchor);
  const fromMonth = Math.max(anchorMonth, toMonthIndex(parseDayKey(fromKey)) - 1);
  const toMonth = toMonthIndex(parseDayKey(toKey)) + 1;
  const occurrences: RecurrenceSpan[] = [];

  for (let month = fromMonth; month <= toMonth; month += 1) {
    const startsAt = new Date(anchor);

    startsAt.setUTCFullYear(Math.floor(month / 12), month % 12, 1);
    startsAt.setUTCDate(Math.min(anchor.getUTCDate(), daysInMonth(month)));

    occurrences.push(toSpan(fromWallClock(startsAt), duration));
  }

  return occurrences;
}

/** INFO: A fixed seven-day step is exact only because `TIME_ZONE` has no daylight saving. */
function projectWeekly(row: RecurringSpan, fromKey: string, toKey: string): RecurrenceSpan[] {
  const anchorMs = Date.parse(row.startsAt);
  const duration = Date.parse(row.endsAt) - anchorMs;
  const rangeEnd = parseDayKey(toKey).getTime() + A_DAY;
  const firstStep = Math.max(
    0,
    Math.floor((parseDayKey(fromKey).getTime() - A_DAY - duration - anchorMs) / A_WEEK),
  );
  const occurrences: RecurrenceSpan[] = [];

  for (let startsAt = anchorMs + firstStep * A_WEEK; startsAt <= rangeEnd; startsAt += A_WEEK) {
    occurrences.push(toSpan(startsAt, duration));
  }

  return occurrences;
}

const A_WEEK = 7 * A_DAY;

function toSpan(startsAt: number, duration: number): RecurrenceSpan {
  return {
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + duration).toISOString(),
  };
}

function toWallClock(iso: string): Date {
  return new Date(Date.parse(iso) + TIME_ZONE_OFFSET_MS);
}

function fromWallClock(wallClock: Date): number {
  return wallClock.getTime() - TIME_ZONE_OFFSET_MS;
}

function toMonthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function daysInMonth(monthIndex: number): number {
  return new Date(Date.UTC(Math.floor(monthIndex / 12), (monthIndex % 12) + 1, 0)).getUTCDate();
}
