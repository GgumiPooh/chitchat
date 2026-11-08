import "server-only";

import { isCuratedObservance, isGoogleBirthdayGreeting } from "@/shared/config";
import { events, getDb, type EventSource } from "@/shared/db";
import {
  MILESTONE_HORIZON_DAYS,
  parseDayKey,
  projectRecurrence,
  shiftDayKey,
  toDayKey,
} from "@/shared/lib";
import { and, gte, lte, ne, or } from "drizzle-orm";
import { compareOccurrences, toOccurrencesInRange } from "../model/occurrences";
import { toCalendarEvent } from "../model/to-calendar-event";
import type { EventOccurrence } from "../model/types";

function isGoogleObservance(row: {
  allDay?: boolean;
  source: EventSource;
  title: string;
}): boolean {
  return row.source === "google" && (row.allDay ?? true) && isCuratedObservance(row.title);
}

/**
 * Every occurrence falling between two day keys, inclusive, with recurring rows
 * projected onto the periods in range (REQUIREMENTS.md § 6.).
 *
 * WARN: The recurring half of the query is deliberately **unfiltered by date** —
 * a recurring row's stored instants sit in its anchor period, so no range predicate
 * on `starts_at` can find the occurrence being asked for. Those rows are a couple's
 * handful of anniversaries and routines, so fetching them whole and projecting in
 * memory is cheaper than the generated-series join that would let Postgres do it.
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
        ne(events.recurrence, "none"),
        and(lte(events.startsAt, instantAfter(toKey)), gte(events.endsAt, instantBefore(fromKey))),
      ),
    );

  const activeRows = rows.filter((row) => !isGoogleBirthdayGreeting(row));
  return toOccurrencesInRange(activeRows.map(toCalendarEvent), fromKey, toKey);
}

/**
 * REQUIREMENTS.md § 11.5. The next occurrences from `todayKey`, for the upcoming
 * list and for the tab-bar dot.
 *
 * INFO: Unified TypeScript projection over all recurrence patterns, including custom RRULE and EXDATEs.
 */
export async function listUpcomingOccurrences(
  todayKey: string,
  limit: number,
): Promise<EventOccurrence[]> {
  const db = getDb();
  const horizonKey = shiftDayKey(todayKey, MILESTONE_HORIZON_DAYS);
  const rows = await db
    .select()
    .from(events)
    .where(
      or(
        ne(events.recurrence, "none"),
        and(
          lte(events.startsAt, instantAfter(horizonKey)),
          gte(events.endsAt, instantBefore(todayKey)),
        ),
      ),
    );

  const nowMs = Date.now();
  const upcomingPerEvent: EventOccurrence[] = [];

  for (const row of rows) {
    if (isGoogleBirthdayGreeting(row) || isGoogleObservance(row)) {
      continue;
    }
    const event = toCalendarEvent(row);
    const candidates = projectRecurrence(event, todayKey, horizonKey)
      .filter((span) => {
        const isStillAhead = event.allDay
          ? toDayKey(span.endsAt) >= todayKey
          : Date.parse(span.endsAt) >= nowMs;
        const isWithinHorizon = toDayKey(span.startsAt) <= horizonKey;

        return isStillAhead && isWithinHorizon;
      })
      .map((span) => ({ event, ...span }))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

    if (candidates.length > 0) {
      upcomingPerEvent.push(candidates[0]);
    }
  }

  return upcomingPerEvent.sort(compareOccurrences).slice(0, limit);
}

/** REQUIREMENTS.md § 11.5. Whether anything falls on a day — the tab-bar dot asks nothing more. */
export async function hasEventOnDay(dayKey: string): Promise<boolean> {
  const occurrences = await listEventOccurrences(dayKey, dayKey);
  const activeOccurrences = occurrences.filter((occ) => !isGoogleObservance(occ.event));

  return activeOccurrences.length > 0;
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
