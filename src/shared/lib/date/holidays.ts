import type { Nullable } from "../nullish";
import { HOLIDAYS } from "./holiday-table";

/**
 * REQUIREMENTS.md § 11.7. A 관공서의 공휴일 — the dates a Korean calendar prints in
 * red, including 대체공휴일 and the 임시공휴일 a cabinet decree adds.
 */
export type Holiday = {
  dayKey: string;
  name: string;
  /** 대체공휴일 — the original fell on a weekend or another holiday and moved here. */
  isSubstitute: boolean;
};

/** `광복절`, or `광복절 대체공휴일` — the name a screen reader is given for the date. */
export function formatHolidayName(holiday: Holiday): string {
  return holiday.isSubstitute ? `${holiday.name} 대체공휴일` : holiday.name;
}

/**
 * The holiday a day key falls on, or `null`.
 *
 * WARN: `Object.hasOwn` and not a truthiness test on the lookup. The table is a
 * plain object literal, so `findHoliday("constructor")` would otherwise answer with
 * an inherited member and fabricate a holiday whose name is `undefined`.
 */
export function findHoliday(dayKey: string): Nullable<Holiday> {
  const entry = Object.hasOwn(HOLIDAYS, dayKey) ? HOLIDAYS[dayKey] : undefined;

  return entry ? { dayKey, name: entry[0], isSubstitute: entry[1] ?? false } : null;
}
