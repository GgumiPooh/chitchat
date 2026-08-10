import type { Nullable, Optional } from "../nullish";
import type { HolidayEntry } from "./holiday-table";

export type { HolidayEntry } from "./holiday-table";

/**
 * REQUIREMENTS.md § 11.7. The committed 공휴일, which the server overlays the API's
 * answer onto and every reader falls back to when that answer does not arrive.
 */
export { HOLIDAYS as FALLBACK_HOLIDAYS } from "./holiday-table";

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

/**
 * Day key → the 공휴일 on it, as the whole set the calendar resolves against.
 *
 * WARN: REQUIREMENTS.md § 11.7. This crosses to the client whole rather than being
 * queried per month — the grid resolves markers for every month it is swiped to, so
 * a lookup that is `async` or reaches the network breaks the swipe.
 */
export type HolidayTable = Record<string, Optional<HolidayEntry>>;

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
 *
 * WARN: REQUIREMENTS.md § 11.7. The table is passed rather than defaulted to
 * `FALLBACK_HOLIDAYS`. A default would pin the committed table into the client bundle
 * beside the copy the server already sends, and a caller that forgot the argument
 * would silently draw the fallback over the answer 특일 정보 gave.
 */
export function findHoliday(dayKey: string, table: HolidayTable): Nullable<Holiday> {
  const entry = Object.hasOwn(table, dayKey) ? table[dayKey] : undefined;

  return entry ? { dayKey, name: entry[0], isSubstitute: entry[1] ?? false } : null;
}
