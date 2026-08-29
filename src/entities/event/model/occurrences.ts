import { compareId, projectRecurrence, toDayKey } from "@/shared/lib";
import type { CalendarEvent, EventOccurrence } from "./types";

/**
 * REQUIREMENTS.md § 6. Projects recurring rows onto every period the range touches
 * and passes `none` rows through, dropping whatever falls outside.
 *
 * INFO: The arithmetic is `projectRecurrence` in `shared/lib`, so a client module can reach it without this entity's `server-only` barrel.
 */
export function toOccurrencesInRange(
  events: CalendarEvent[],
  fromKey: string,
  toKey: string,
): EventOccurrence[] {
  const occurrences = events.flatMap((event) =>
    projectRecurrence(event, fromKey, toKey).map((span) => ({ event, ...span })),
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

function overlaps(occurrence: EventOccurrence, fromKey: string, toKey: string): boolean {
  return toDayKey(occurrence.startsAt) <= toKey && toDayKey(occurrence.endsAt) >= fromKey;
}
