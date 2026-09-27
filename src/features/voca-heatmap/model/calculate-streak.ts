import type { VocaHeatmapDay } from "@/entities/voca";
import { parseDayKey, shiftDayKey, toDayKey, toWeekday } from "@/shared/lib";

const ROLLOVER_HOURS_MS = 4 * 60 * 60 * 1000;

export type VocaStreak = {
  streak: number;
  studiedToday: boolean;
  todayCount: number;
};

export type VocaWeeklyDay = {
  dayKey: string;
  label: string;
  dayNumber: number;
  count: number;
  isToday: boolean;
  isFuture: boolean;
  status: "completed" | "today-pending" | "missed" | "future";
};

/**
 * Returns today's session dayKey in KST, taking the 4:00 AM rollover into account.
 */
export function getVocaTodayKey(now: Date = new Date()): string {
  const adjusted = new Date(now.getTime() - ROLLOVER_HOURS_MS);

  return toDayKey(adjusted);
}

/**
 * Calculates the current consecutive study streak in session days.
 * If the user has studied today, the streak is counted backwards from today.
 * If the user has not yet studied today, but studied yesterday, the streak remains
 * active from yesterday (encouraging the user to study today to extend it).
 */
export function calculateVocaStreak(
  heatmap: VocaHeatmapDay[],
  todayKey: string = getVocaTodayKey(),
): VocaStreak {
  const countMap = new Map<string, number>();
  for (const item of heatmap) {
    if (item.count > 0) {
      countMap.set(item.dayKey, item.count);
    }
  }

  const todayCount = countMap.get(todayKey) ?? 0;
  const studiedToday = todayCount > 0;

  let streak = 0;
  let checkKey = studiedToday ? todayKey : shiftDayKey(todayKey, -1);

  while (true) {
    const count = countMap.get(checkKey) ?? 0;
    if (count > 0) {
      streak++;
      checkKey = shiftDayKey(checkKey, -1);
    } else {
      break;
    }
  }

  return { streak, studiedToday, todayCount };
}

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/**
 * Builds the 7 days of the current week (Monday to Sunday) for the weekly streak strip.
 */
export function getVocaWeeklyDays(
  heatmap: VocaHeatmapDay[],
  todayKey: string = getVocaTodayKey(),
): VocaWeeklyDay[] {
  const countMap = new Map<string, number>();
  for (const item of heatmap) {
    if (item.count > 0) {
      countMap.set(item.dayKey, item.count);
    }
  }

  const todayWeekday = toWeekday(todayKey);
  const offsetFromMonday = (todayWeekday + 6) % 7;
  const mondayKey = shiftDayKey(todayKey, -offsetFromMonday);

  const days: VocaWeeklyDay[] = [];

  for (let i = 0; i < 7; i++) {
    const dayKey = shiftDayKey(mondayKey, i);
    const count = countMap.get(dayKey) ?? 0;
    const isToday = i === offsetFromMonday;
    const isFuture = i > offsetFromMonday;
    const isPast = i < offsetFromMonday;

    let status: VocaWeeklyDay["status"] = "future";
    if (count > 0) {
      status = "completed";
    } else if (isToday) {
      status = "today-pending";
    } else if (isPast) {
      status = "missed";
    }

    const dayNumber = parseDayKey(dayKey).getUTCDate();

    days.push({
      dayKey,
      label: WEEKDAY_LABELS[i],
      dayNumber,
      count,
      isToday,
      isFuture,
      status,
    });
  }

  return days;
}
