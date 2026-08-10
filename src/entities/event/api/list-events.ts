import "server-only";

import { events, getDb } from "@/shared/db";
import { parseDayKey, shiftDayKey, toDayKey } from "@/shared/lib";
import { and, eq, gte, lte, or } from "drizzle-orm";
import { isOccurrenceUnfinished, toOccurrencesInRange } from "../model/occurrences";
import { toCalendarEvent } from "../model/to-calendar-event";
import type { EventOccurrence } from "../model/types";

/**
 * Every occurrence falling between two day keys, inclusive, with `yearly` rows
 * projected onto the years in range (REQUIREMENTS.md § 6.).
 *
 * WARN: The `yearly` half of the query is deliberately **unfiltered by date** —
 * a recurring row's stored instants sit in its anchor year, so no range predicate
 * on `starts_at` can find the occurrence being asked for. Those rows are the
 * couple's anniversaries and number in the single digits, so fetching them whole
 * and projecting in memory is cheaper than the generated-series join that would
 * let Postgres do it.
 */
export async function listEventOccurrences(
  fromKey: string,
  toKey: string,
): Promise<EventOccurrence[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(events)
    .where(
      or(
        eq(events.recurrence, "yearly"),
        and(lte(events.startsAt, instantAfter(toKey)), gte(events.endsAt, instantBefore(fromKey))),
      ),
    );

  return toOccurrencesInRange(rows.map(toCalendarEvent), fromKey, toKey);
}

/**
 * REQUIREMENTS.md § 11.5. The next occurrences from `todayKey`, for the upcoming
 * card and for the tab-bar dot.
 *
 * INFO: The horizon is a year because that is the furthest `findNextMilestone`
 * looks, and a card summarising an event further out than that would be noise.
 *
 * WARN: The day range alone is not the answer — it keeps a breakfast that ended at
 * 09:00 "upcoming" until midnight, holding one of the card's `MAX_UPCOMING_EVENTS`
 * slots (`DESIGN.md § 7.9.`). `isOccurrenceUnfinished` is what narrows it to what is
 * genuinely left.
 */
export async function listUpcomingOccurrences(
  todayKey: string,
  limit: number,
): Promise<EventOccurrence[]> {
  const occurrences = await listEventOccurrences(todayKey, shiftDayKey(todayKey, 365));
  // INFO: Read here for the reason `hasEventToday` gives below — the card renders on the client, where a `Date.now()` in the body would be an impure render.
  const now = Date.now();

  return occurrences
    .filter((occurrence) => isOccurrenceUnfinished(occurrence, todayKey, now))
    .slice(0, limit);
}

/** REQUIREMENTS.md § 11.5. Whether anything falls on a day — the tab-bar dot asks nothing more. */
export async function hasEventOnDay(dayKey: string): Promise<boolean> {
  const occurrences = await listEventOccurrences(dayKey, dayKey);

  return occurrences.length > 0;
}

/**
 * WARN: The clock is read **here**, not by the shell that renders the dot — a
 * `Date.now()` in a component body is an impure render (`react-hooks/purity`) and
 * would also let a client's clock decide what "today" means.
 */
export async function hasEventToday(): Promise<boolean> {
  return hasEventOnDay(toDayKey(Date.now()));
}

/**
 * WARN: A day key names a `TIME_ZONE` calendar day but `parseDayKey` answers UTC
 * midnight, so the two disagree by the zone's offset. These bounds are therefore
 * a full day wide on each side — the predicate only has to be a **superset**, and
 * `toOccurrencesInRange` does the exact day-key filtering afterwards. Tightening
 * them to the day itself silently drops an event in the offset's worth of hours
 * at either edge.
 */
function instantBefore(dayKey: string): Date {
  return parseDayKey(shiftDayKey(dayKey, -1));
}

function instantAfter(dayKey: string): Date {
  return parseDayKey(shiftDayKey(dayKey, 1));
}
