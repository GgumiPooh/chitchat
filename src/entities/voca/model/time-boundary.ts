import { AN_HOUR, toDayKey } from "@/shared/lib";

export const VOCA_ROLLOVER_HOUR = 4;

/**
 * Calculates the session day key in KST with a 4:00 AM rollover.
 * Any study or review before 4:00 AM KST is credited to the preceding day.
 */
export function toVocaSessionDayKey(
  date: Date = new Date(),
  rolloverHour = VOCA_ROLLOVER_HOUR,
): string {
  const adjusted = new Date(date.getTime() - rolloverHour * AN_HOUR);

  return toDayKey(adjusted);
}

/**
 * Returns the start timestamp (4:00:00 KST) for a given session dayKey (YYYY-MM-DD).
 */
export function toVocaSessionStart(sessionDayKey: string, rolloverHour = VOCA_ROLLOVER_HOUR): Date {
  const hourString = String(rolloverHour).padStart(2, "0");

  return new Date(`${sessionDayKey}T${hourString}:00:00+09:00`);
}
