import { compareId, parseDayKey, toDayKey } from "@/shared/lib";
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

/**
 * Chronological, with all-day events ahead of timed ones that start the same day and
 * the older event first where even the instant ties.
 *
 * WARN: The last arm is `compareId` and never `<` (`AGENTS.md § 3.2.`). It is also not
 * decoration: without it the tie falls to whatever order the rows came back in, so two
 * events at one instant can swap places between renders of the same list — and every
 * screen here sorts through this one function.
 */
export function compareOccurrences(a: EventOccurrence, b: EventOccurrence): number {
  const dayComparison = toDayKey(a.startsAt).localeCompare(toDayKey(b.startsAt));

  if (dayComparison !== 0) {
    return dayComparison;
  }

  if (a.event.allDay !== b.event.allDay) {
    return a.event.allDay ? -1 : 1;
  }

  const startComparison = a.startsAt.localeCompare(b.startsAt);

  // INFO: A snowflake orders by the moment it was minted (REQUIREMENTS.md § 6.), so this is "whichever was added first".
  return startComparison === 0 ? compareId(a.event.id, b.event.id) : startComparison;
}

/**
 * WARN: The duration is carried across rather than the end date being rebuilt
 * from its own fields — a 12월 31일 → 1월 1일 event would otherwise project onto
 * a year where its end lands before its start.
 *
 * WARN: `listUpcomingOccurrences` encodes this same rule in SQL, because a `LIMIT`
 * needs the sort key in the database — change one and change both. That copy exists
 * only because a range spanning a year boundary is what makes this one a loop.
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
