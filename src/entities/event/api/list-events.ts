import "server-only";

import { events, getDb, type Event } from "@/shared/db";
import {
  MILESTONE_HORIZON_DAYS,
  parseDayKey,
  shiftDayKey,
  TIME_ZONE,
  toDayKey,
} from "@/shared/lib";
import { and, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { toOccurrencesInRange } from "../model/occurrences";
import { toCalendarEvent } from "../model/to-calendar-event";
import type { EventOccurrence } from "../model/types";

// WARN: Every timestamp is a `string` here and not a `Date`. `execute` bypasses drizzle's column mapping, so postgres.js hands back the raw text — `asIso` below is what makes that text something `new Date` parses exactly.
type UpcomingRow = Omit<Event, "startsAt" | "endsAt"> & {
  startsAt: string;
  endsAt: string;
  occurrenceStartsAt: string;
  occurrenceEndsAt: string;
};

// INFO: `toISOString`'s own format, so a projected instant crosses the wire looking identical to one `projectYearly` produced.
function asIso(instant: SQL): SQL {
  return sql`to_char(${instant} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

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
 * list and for the tab-bar dot. `limit` is the database's, so a 더 보기 reads one
 * page rather than a year of rows again.
 *
 * INFO: The horizon is `MILESTONE_HORIZON_DAYS` because that is the furthest
 * `findNextMilestone` looks, and a row summarising an event further out than that
 * would be noise.
 *
 * WARN: The projection rule is encoded here **and** in `projectYearly`, and the two
 * cannot be merged. A month grid's range can span a year boundary, where one `yearly`
 * row appears twice and no scalar expression answers; this path needs only the next
 * single occurrence, which is what makes a scalar one possible and a `LIMIT` real.
 * They are held together by agreeing on `setUTCFullYear`'s own arithmetic — months
 * from January of the target year, then days, so a 2월 29일 anchor overflows to 3월 1일
 * on both sides rather than being clamped to 2월 28일 by `+ interval 'n years'`.
 *
 * WARN: There is no index behind the `ORDER BY`, and there cannot be one. The sort
 * key is the projected start, which is a function of **today** as well as of the row —
 * so it is not immutable and no expression index may be built on it. `events` is two
 * people's calendar; the sequential scan is the decision (`REQUIREMENTS.md § 11.5.`).
 */
export async function listUpcomingOccurrences(
  todayKey: string,
  limit: number,
): Promise<EventOccurrence[]> {
  // INFO: Read here rather than by the caller, so a client's clock never decides what is still ahead (`hasEventToday` below gives the same reason).
  const now = new Date().toISOString();
  const duration = sql`${events.endsAt} - ${events.startsAt}`;
  const anchorStart = sql`${events.startsAt}`;
  const rows = await getDb().execute<UpcomingRow>(sql`
    with bounds as (
      select
        ${todayKey}::date as today,
        ${todayKey}::date + ${MILESTONE_HORIZON_DAYS}::int as horizon,
        extract(year from ${todayKey}::date)::int as year,
        ${now}::timestamptz as instant
    )
    select
      ${events.id} as "id",
      ${events.title} as "title",
      ${events.description} as "description",
      ${asIso(anchorStart)} as "startsAt",
      ${asIso(sql`${events.endsAt}`)} as "endsAt",
      ${events.allDay} as "allDay",
      ${events.color} as "color",
      ${events.recurrence} as "recurrence",
      ${events.scope} as "scope",
      ${events.createdBy} as "createdBy",
      ${asIso(sql`occurrence.starts_at`)} as "occurrenceStartsAt",
      ${asIso(sql`occurrence.ends_at`)} as "occurrenceEndsAt"
    from ${events}
    cross join bounds
    cross join lateral (
      select ${events.startsAt} at time zone 'UTC' as anchor_utc
    ) as stored
    cross join lateral (
      select candidate.starts_at, candidate.ends_at
      from (
        select projected.starts_at, projected.starts_at + (${duration}) as ends_at
        from (
          select
            case
              when ${events.recurrence} = 'yearly' then (
                make_timestamp(target.year, 1, 1, 0, 0, 0)
                  + make_interval(
                      months => extract(month from stored.anchor_utc)::int - 1,
                      days => extract(day from stored.anchor_utc)::int - 1
                    )
                  + (stored.anchor_utc - date_trunc('day', stored.anchor_utc))
              ) at time zone 'UTC'
              else ${events.startsAt}
            end as starts_at
          from generate_series(bounds.year - 1, bounds.year + 1) as target(year)
          where ${events.recurrence} = 'yearly' or target.year = bounds.year
        ) as projected
      ) as candidate
      where (candidate.starts_at at time zone ${TIME_ZONE}::text)::date <= bounds.horizon
        and case
          when ${events.allDay}
            then (candidate.ends_at at time zone ${TIME_ZONE}::text)::date >= bounds.today
          else candidate.ends_at >= bounds.instant
        end
      order by candidate.starts_at
      limit 1
    ) as occurrence
    order by
      (occurrence.starts_at at time zone ${TIME_ZONE}::text)::date,
      ${events.allDay} desc,
      occurrence.starts_at,
      ${events.id}
    limit ${limit}::int
  `);

  return rows.map((row) => ({
    event: toCalendarEvent({
      ...row,
      startsAt: new Date(row.startsAt),
      endsAt: new Date(row.endsAt),
    }),
    startsAt: row.occurrenceStartsAt,
    endsAt: row.occurrenceEndsAt,
  }));
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
