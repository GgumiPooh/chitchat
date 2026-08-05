import type { EventOccurrence } from "@/entities/event";
import {
  listDayKeysBetween,
  listMilestonesInRange,
  shiftDayKey,
  toDayOfMonth,
  toMonthKey,
  toMonthStart,
  toWeekday,
  type Milestone,
} from "@/shared/lib";

const DAYS_IN_WEEK = 7;

export type MonthCell = {
  dayKey: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  occurrences: EventOccurrence[];
  milestones: Milestone[];
};

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
): MonthCell[] {
  const dayKeys = listGridDayKeys(monthKey);
  const occurrencesByDay = groupByDay(occurrences);
  const milestonesByDay = groupMilestonesByDay(
    listMilestonesInRange(startDate, dayKeys[0], dayKeys.at(-1) ?? dayKeys[0]),
  );

  return dayKeys.map((dayKey) => ({
    dayKey,
    dayOfMonth: toDayOfMonth(dayKey),
    isCurrentMonth: toMonthKey(dayKey) === monthKey,
    occurrences: occurrencesByDay.get(dayKey) ?? [],
    milestones: milestonesByDay.get(dayKey) ?? [],
  }));
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
