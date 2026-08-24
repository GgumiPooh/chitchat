import type { SystemAction } from "@/shared/db";
import type { Maybe, Nullable } from "../nullish";
import { countDays, formatMonthDay, parseDayKey, shiftDayKey, toDayKey } from "./time";

/**
 * REQUIREMENTS.md § 11.2. Derived from the relationship start date; never a row.
 *
 * WARN: This module lives in `shared` rather than in `entities/event` for the
 * reason `toMediaUrl` does (§ 9.) — the month grid derives its milestone markers
 * in the browser, and a value import from that barrel would drag `server-only`
 * into the client bundle. Nothing here touches an event or a clock.
 */
export type MilestoneKind = "hundred" | "yearly";

export type Milestone = {
  dayKey: string;
  kind: MilestoneKind;
  /** `100일`, `1주년` — the label as it is shown. */
  label: string;
};

/** DESIGN.md § 7.9. The next milestone with the countdown the band renders beneath the D-day. */
export type UpcomingMilestone = Milestone & {
  daysLeft: number;
};

/**
 * REQUIREMENTS.md § 11.2. Anniversaries fall every hundred days, counted from day 1.
 *
 * WARN: Both constants live here rather than in `shared/config`, where the rest of
 * the calendar's constants are — `shared/config` already imports `shared/lib`, so
 * the reverse would be a cycle. Declaring them in both places is worse: the grid
 * derives its markers from these and would silently disagree with the D-day band.
 */
export const MILESTONE_DAY_STEP = 100;

// INFO: DESIGN.md § 7.9. The band hides the countdown when the next milestone is further out than this, rather than advertising a date a year away.
export const MILESTONE_HORIZON_DAYS = 365;

/**
 * Every hundredth day and every yearly anniversary between two day keys.
 *
 * INFO: Pure date arithmetic on values the server already resolved, which is why
 * it may run in the browser — swiping to another month must not cost a request.
 */
export function listMilestonesInRange(
  startDate: string,
  fromKey: string,
  toKey: string,
): Milestone[] {
  return [
    ...listHundredDayMilestones(startDate, fromKey, toKey),
    ...listYearlyMilestones(startDate, fromKey, toKey),
  ].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/**
 * DESIGN.md § 7.9. The soonest milestone after `todayKey`, or `null` when the next
 * one is further out than `horizonDays` — the band hides rather than advertising a
 * date a year away.
 */
export function findNextMilestone(
  startDate: string,
  todayKey: string,
  horizonDays: number,
): Nullable<UpcomingMilestone> {
  // INFO: Today itself is excluded — the countdown would read `0일` while the D-day directly above already says so.
  const next = listMilestonesInRange(
    startDate,
    shiftDayKey(todayKey, 1),
    shiftDayKey(todayKey, horizonDays),
  ).at(0);

  return next ? { ...next, daysLeft: countDays(todayKey, next.dayKey) } : null;
}

/**
 * REQUIREMENTS.md § 11.5. The calendar notice, without the actor's name.
 *
 * WARN: The name is prefixed by `composeEventNotice` at render time and is never
 * stored (§ 8.7.), so this half is also what the § 16.1. push banner carries as
 * its body — the banner's title is already the sender.
 */
export function composeEventNoticeBody(
  action: Maybe<SystemAction>,
  title: Maybe<string>,
  startsAt: Maybe<string>,
): string {
  const date = startsAt ? formatMonthDay(startsAt) : "";

  // WARN: The title is a second line and the break is load-bearing — REQUIREMENTS.md § 8.3. prices this row from this very string, so `SystemNotice` renders it under `whitespace-pre-wrap` and `toNoticeHeight` measures it under the same mode. Anything that collapses the break here counts the row a line short.
  switch (action) {
    case "event_created":
      return `${date} 일정을 추가했어요\n"${title ?? ""}"`;
    case "event_rescheduled":
      return `일정을 ${date}로 옮겼어요\n"${title ?? ""}"`;
    case "event_deleted":
      return `${date} 일정을 삭제했어요\n"${title ?? ""}"`;
    default:
      return "";
  }
}

/** The same sentence with its actor, composed from the live nickname (§ 8.7.). */
export function composeEventNotice(
  action: Maybe<SystemAction>,
  title: Maybe<string>,
  startsAt: Maybe<string>,
  name: Maybe<string>,
): string {
  const body = composeEventNoticeBody(action, title, startsAt);

  return body && name ? `${name}님이 ${body}` : body;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a value is a real `YYYY-MM-DD` calendar date.
 *
 * WARN: The shape test alone is not enough — `2026-13-45` matches the pattern and
 * still parses to an Invalid Date, which every formatter here throws on. Anything
 * reaching a date helper from a URL or a request body goes through this first.
 */
export function isDayKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DAY_KEY_PATTERN.test(value) &&
    !Number.isNaN(parseDayKey(value).getTime())
  );
}

/** Every day key an instant range covers, so a multi-day event marks each of its cells. */
export function listDayKeysBetween(fromIso: string, toIso: string): string[] {
  const lastKey = toDayKey(toIso);
  const dayKeys = [toDayKey(fromIso)];

  for (let key = dayKeys[0]; key < lastKey;) {
    key = shiftDayKey(key, 1);
    dayKeys.push(key);
  }

  return dayKeys;
}

/**
 * WARN: Day 1 is the start date (§ 11.1.), so the hundredth day is 99 days after
 * it, not 100. Every offset here carries that `- 1`.
 */
function listHundredDayMilestones(startDate: string, fromKey: string, toKey: string): Milestone[] {
  const firstDay = Math.max(countDays(startDate, fromKey) + 1, MILESTONE_DAY_STEP);
  const lastDay = countDays(startDate, toKey) + 1;
  const milestones: Milestone[] = [];

  for (
    let day = Math.ceil(firstDay / MILESTONE_DAY_STEP) * MILESTONE_DAY_STEP;
    day <= lastDay;
    day += MILESTONE_DAY_STEP
  ) {
    milestones.push({
      dayKey: shiftDayKey(startDate, day - 1),
      kind: "hundred",
      label: `${day}일`,
    });
  }

  return milestones;
}

/**
 * WARN: Built by calendar-field arithmetic rather than by adding 365 days, so a
 * leap year cannot walk the anniversary onto the day before. A 2월 29일 start
 * normalises to 3월 1일 in a common year, which is what `Date.UTC` already does.
 */
function listYearlyMilestones(startDate: string, fromKey: string, toKey: string): Milestone[] {
  const start = parseDayKey(startDate);
  const milestones: Milestone[] = [];

  for (
    let year = parseDayKey(fromKey).getUTCFullYear();
    year <= parseDayKey(toKey).getUTCFullYear();
    year += 1
  ) {
    const count = year - start.getUTCFullYear();
    const dayKey = toDayKey(Date.UTC(year, start.getUTCMonth(), start.getUTCDate()));

    if (count >= 1 && dayKey >= fromKey && dayKey <= toKey) {
      milestones.push({ dayKey, kind: "yearly", label: `${count}주년` });
    }
  }

  return milestones;
}
