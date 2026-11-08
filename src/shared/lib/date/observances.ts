import type { Nullable, Optional } from "../nullish";
import type { HolidayTable } from "./holidays";
import { findHoliday } from "./holidays";
import { shiftDayKey, toWeekday } from "./time";

/**
 * Common annual Korean fixed observances (양력 고정 기념일).
 * Keys are "MM-DD".
 */
export const FIXED_OBSERVANCES: Record<string, string> = {
  "02-14": "밸런타인데이",
  "03-14": "화이트데이",
  "04-05": "식목일",
  "05-08": "어버이날",
  "05-15": "스승의 날",
  "05-21": "부부의 날",
  "07-17": "제헌절",
  "10-01": "국군의 날",
  "10-25": "독도의 날",
  "11-11": "농업인의 날",
  "12-24": "크리스마스 이브",
};

/**
 * Identifies the observance for a dayKey, prioritizing customTitle (e.g. imported from Google
 * Calendar for lunisolar/seasonal observances like 초복/중복/말복/정월대보름/동지) and falling back
 * to fixed annual Korean observances.
 */
export function findObservance(
  dayKey: string,
  customTitle?: Optional<Nullable<string>>,
): Nullable<string> {
  if (customTitle && customTitle.trim()) {
    return customTitle.trim();
  }

  const mmDd = dayKey.slice(5);
  return FIXED_OBSERVANCES[mmDd] ?? null;
}

function isRestDayKey(dayKey: string, holidays: HolidayTable): boolean {
  if (findHoliday(dayKey, holidays) !== null) {
    return true;
  }
  const weekday = toWeekday(dayKey);
  return weekday === 0 || weekday === 6;
}

/**
 * Calculates continuous rest days (holidays and weekends) connected to `dayKey`.
 * Returns the span length if >= 3 (e.g. 3 for a 3-day long weekend), otherwise 0.
 */
export function findHolidayConsecutiveDays(dayKey: string, holidays: HolidayTable): number {
  if (findHoliday(dayKey, holidays) === null) {
    return 0;
  }

  let startKey = dayKey;
  let backwardSteps = 0;
  while (isRestDayKey(shiftDayKey(startKey, -1), holidays) && backwardSteps < 15) {
    startKey = shiftDayKey(startKey, -1);
    backwardSteps += 1;
  }

  let endKey = dayKey;
  let forwardSteps = 0;
  while (isRestDayKey(shiftDayKey(endKey, 1), holidays) && forwardSteps < 15) {
    endKey = shiftDayKey(endKey, 1);
    forwardSteps += 1;
  }

  // Count days inclusively
  let count = 1;
  let curr = startKey;
  while (curr !== endKey) {
    curr = shiftDayKey(curr, 1);
    count += 1;
    if (count > 15) {
      break; // Safety break
    }
  }

  return count >= 3 ? count : 0;
}
