import { parseDayKey, toDayKey } from "@/shared/lib";
import type { CalendarEvent, EventOccurrence } from "./types";

/**
 * REQUIREMENTS.md § 6. Projects `yearly` rows onto every year the range touches
 * and passes `none` rows through, dropping whatever falls outside.
 *
 * INFO: Recurrence is yearly-only by design — never introduce RRULE here. That is
 * also why the projection is a loop over at most a handful of years rather than a
 * rule engine.
 */
export function toOccurrencesInRange(
  events: CalendarEvent[],
  fromKey: string,
  toKey: string,
): EventOccurrence[] {
  const occurrences = events.flatMap((event) =>
    event.recurrence === "yearly"
      ? projectYearly(event, fromKey, toKey)
      : [{ event, startsAt: event.startsAt, endsAt: event.endsAt }],
  );

  return occurrences
    .filter((occurrence) => overlaps(occurrence, fromKey, toKey))
    .sort(compareOccurrences);
}

/** Chronological, with all-day events ahead of timed ones that start the same day. */
export function compareOccurrences(a: EventOccurrence, b: EventOccurrence): number {
  const dayComparison = toDayKey(a.startsAt).localeCompare(toDayKey(b.startsAt));

  if (dayComparison !== 0) {
    return dayComparison;
  }

  if (a.event.allDay !== b.event.allDay) {
    return a.event.allDay ? -1 : 1;
  }

  return a.startsAt.localeCompare(b.startsAt);
}

/**
 * WARN: The duration is carried across rather than the end date being rebuilt
 * from its own fields — a 12월 31일 → 1월 1일 event would otherwise project onto
 * a year where its end lands before its start.
 */
function projectYearly(event: CalendarEvent, fromKey: string, toKey: string): EventOccurrence[] {
  const anchorStart = new Date(event.startsAt);
  const duration = Date.parse(event.endsAt) - Date.parse(event.startsAt);
  // INFO: A year wider on each side than the range asks for, because the anchor is an instant and `TIME_ZONE` is ahead of UTC — an event just after midnight belongs to the next calendar year from the projection's point of view. `overlaps` drops whatever the widening let through.
  const fromYear = parseDayKey(fromKey).getUTCFullYear() - 1;
  const toYear = parseDayKey(toKey).getUTCFullYear() + 1;
  const occurrences: EventOccurrence[] = [];

  for (let year = fromYear; year <= toYear; year += 1) {
    const startsAt = new Date(anchorStart);

    startsAt.setUTCFullYear(year);

    occurrences.push({
      event,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + duration).toISOString(),
    });
  }

  return occurrences;
}

function overlaps(occurrence: EventOccurrence, fromKey: string, toKey: string): boolean {
  return toDayKey(occurrence.startsAt) <= toKey && toDayKey(occurrence.endsAt) >= fromKey;
}
