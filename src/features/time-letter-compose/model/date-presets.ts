import type { Nullable } from "@/shared/lib";
import { shiftDayKey, toDayKey, toInstant } from "@/shared/lib";

export type DatePreset = {
  label: string;
  getDayKey: (todayKey: string) => string;
  time: string;
  id: "tomorrow" | "days100" | "year1";
};

export const DATE_PRESETS: readonly DatePreset[] = [
  {
    id: "tomorrow",
    label: "내일 아침 8시",
    getDayKey: (todayKey) => shiftDayKey(todayKey, 1),
    time: "08:00",
  },
  {
    id: "days100",
    label: "100일 뒤",
    getDayKey: (todayKey) => shiftDayKey(todayKey, 100),
    time: "08:00",
  },
  {
    id: "year1",
    label: "1년 뒤 오늘",
    getDayKey: (todayKey) => {
      const [yearStr, monthStr, dateStr] = todayKey.split("-");
      const nextYear = Number(yearStr) + 1;
      if (monthStr === "02" && dateStr === "29") {
        return `${nextYear}-02-28`;
      }
      return `${nextYear}-${monthStr}-${dateStr}`;
    },
    time: "08:00",
  },
] as const;

export function getDefaultScheduledDateTime(): { dayKey: string; time: string } {
  const todayKey = toDayKey(Date.now());
  const tomorrowKey = shiftDayKey(todayKey, 1);
  return { dayKey: tomorrowKey, time: "08:00" };
}

export function validateLetterDate(
  dayKey: string,
  time: string,
): { isValid: boolean; issue: Nullable<string>; scheduledDate: Nullable<Date> } {
  if (!dayKey || !time) {
    return {
      isValid: false,
      issue: "도착할 날짜와 시간을 입력해 주세요",
      scheduledDate: null,
    };
  }

  const instant = toInstant(dayKey, time);
  if (!instant) {
    return {
      isValid: false,
      issue: "올바른 날짜와 시간을 입력해 주세요",
      scheduledDate: null,
    };
  }

  const scheduledDate = new Date(instant);
  const scheduledTimeMs = scheduledDate.getTime();
  // INFO: Minimum 10 minutes in the future requirement
  const minAllowedMs = Date.now() + 10 * 60 * 1000;

  if (scheduledTimeMs < minAllowedMs) {
    return {
      isValid: false,
      issue: "최소 10분 이후의 시간으로 설정해야 해요",
      scheduledDate,
    };
  }

  return { isValid: true, issue: null, scheduledDate };
}
