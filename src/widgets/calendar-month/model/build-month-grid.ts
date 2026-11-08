import type { EventOccurrence } from "@/entities/event";
import { isCuratedObservance } from "@/shared/config";
import {
  findHoliday,
  findObservance,
  listDayKeysBetween,
  listMilestonesInRange,
  shiftDayKey,
  toDayOfMonth,
  toMonthKey,
  toMonthStart,
  toWeekday,
  type Holiday,
  type HolidayTable,
  type Milestone,
  type Nullable,
} from "@/shared/lib";

const DAYS_IN_WEEK = 7;

export type MonthCell = {
  dayKey: string;
  dayOfMonth: number;
  weekday: number;
  isCurrentMonth: boolean;
  /** REQUIREMENTS.md § 11.7. Never an occurrence — a holiday takes no event dot and no slot. */
  holiday: Nullable<Holiday>;
  /** REQUIREMENTS.md § 11.7. Curated Korean observances (e.g. 어버이날, 식목일) — takes no event dot. */
  observance: Nullable<string>;
  occurrences: EventOccurrence[];
  milestones: Milestone[];
};

/**
 * Checks whether an occurrence represents a Google holiday calendar observance (e.g. 어버이날, 초복).
 * Personal couple events manually created with the same name are never filtered.
 */
function isObservanceOccurrence(occurrence: EventOccurrence): boolean {
  return (
    occurrence.event.source === "google" &&
    occurrence.event.allDay &&
    isCuratedObservance(occurrence.event.title)
  );
}

/**
 * DESIGN.md § 7.9. The month's cells, padded to whole weeks with the adjacent
 * months' days.
 *
 * INFO: Milestones are derived here rather than fetched, because they are pure
 * arithmetic on the relationship start date (REQUIREMENTS.md § 11.2.) — swiping
 * to another month must not cost a request for them.
 */
export function buildMonthGrid(
  monthKey: string,
  startDate: string,
  occurrences: EventOccurrence[],
  holidays: HolidayTable,
): MonthCell[] {
  const dayKeys = listGridDayKeys(monthKey);
  const nonObservanceOccurrences = occurrences.filter((occ) => !isObservanceOccurrence(occ));
  const occurrencesByDay = groupByDay(nonObservanceOccurrences);
  const observancesByDay = groupObservancesByDay(occurrences);
  const milestonesByDay = groupMilestonesByDay(
    listMilestonesInRange(startDate, dayKeys[0], dayKeys.at(-1) ?? dayKeys[0]),
  );

  return dayKeys.map((dayKey) => {
    const holiday = findHoliday(dayKey, holidays);
    const rawObservance = findObservance(dayKey, observancesByDay.get(dayKey));
    const observance = holiday && holiday.name === rawObservance ? null : rawObservance;

    return {
      dayKey,
      dayOfMonth: toDayOfMonth(dayKey),
      weekday: toWeekday(dayKey),
      isCurrentMonth: toMonthKey(dayKey) === monthKey,
      holiday,
      observance,
      occurrences: occurrencesByDay.get(dayKey) ?? [],
      milestones: milestonesByDay.get(dayKey) ?? [],
    };
  });
}

/** The inclusive day-key range the grid covers, which is what the month's fetch asks for. */
export function toGridRange(monthKey: string): { from: string; to: string } {
  const dayKeys = listGridDayKeys(monthKey);

  return { from: dayKeys[0], to: dayKeys.at(-1) ?? dayKeys[0] };
}

// WARN: Always six rows, never five or four. A grid whose height changes with the month makes every swipe reflow the screen under the user's thumb.
function listGridDayKeys(monthKey: string): string[] {
  const firstOfMonth = toMonthStart(monthKey);
  const firstCell = shiftDayKey(firstOfMonth, -toWeekday(firstOfMonth));

  return Array.from({ length: 6 * DAYS_IN_WEEK }, (_, index) => shiftDayKey(firstCell, index));
}

function groupByDay(occurrences: EventOccurrence[]): Map<string, EventOccurrence[]> {
  const grouped = new Map<string, EventOccurrence[]>();

  for (const occurrence of occurrences) {
    // INFO: A multi-day event marks every cell it covers, not only the one it starts in.
    for (const dayKey of listDayKeysBetween(occurrence.startsAt, occurrence.endsAt)) {
      grouped.set(dayKey, [...(grouped.get(dayKey) ?? []), occurrence]);
    }
  }

  return grouped;
}

function groupMilestonesByDay(milestones: Milestone[]): Map<string, Milestone[]> {
  const grouped = new Map<string, Milestone[]>();

  for (const milestone of milestones) {
    grouped.set(milestone.dayKey, [...(grouped.get(milestone.dayKey) ?? []), milestone]);
  }

  return grouped;
}

function groupObservancesByDay(occurrences: EventOccurrence[]): Map<string, string> {
  const grouped = new Map<string, string>();

  for (const occurrence of occurrences) {
    if (isObservanceOccurrence(occurrence)) {
      for (const dayKey of listDayKeysBetween(occurrence.startsAt, occurrence.endsAt)) {
        if (!grouped.has(dayKey)) {
          grouped.set(dayKey, occurrence.event.title);
        }
      }
    }
  }

  return grouped;
}
