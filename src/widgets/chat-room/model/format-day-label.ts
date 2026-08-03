import { A_DAY, formatDateWithWeekday, toDayKey } from "@/shared/lib";

/** DESIGN.md § 6.4. `오늘`, `어제`, then the full date. */
export function formatDayLabel(dayKey: string): string {
  const now = Date.now();

  if (dayKey === toDayKey(now)) {
    return "오늘";
  }
  if (dayKey === toDayKey(now - A_DAY)) {
    return "어제";
  }

  // INFO: `YYYY-MM-DD` parses as UTC midnight, which is still the same calendar day in `TIME_ZONE` — Seoul is ahead of UTC.
  return formatDateWithWeekday(`${dayKey}T00:00:00Z`);
}
