"use client";

import type { VocaHeatmapDay } from "@/entities/voca";
import { cn } from "@/shared/lib";
import { Flame } from "lucide-react";
import { useMemo } from "react";
import {
  calculateVocaStreak,
  getVocaTodayKey,
  getVocaWeeklyDays,
  type VocaWeeklyDay,
} from "../model/calculate-streak";

export type VocaWeeklyStreakProps = {
  className?: string;
  heatmap: VocaHeatmapDay[];
  todayKey?: string;
};

export function VocaWeeklyStreak({ className, heatmap, todayKey }: VocaWeeklyStreakProps) {
  const currentTodayKey = useMemo(() => todayKey ?? getVocaTodayKey(), [todayKey]);

  const { streak, studiedToday, todayCount } = useMemo(
    () => calculateVocaStreak(heatmap, currentTodayKey),
    [heatmap, currentTodayKey],
  );

  const weeklyDays = useMemo(
    () => getVocaWeeklyDays(heatmap, currentTodayKey),
    [heatmap, currentTodayKey],
  );

  return (
    <div className={cn("bg-surface rounded-3xl border border-hairline p-5 shadow-sm", className)}>
      {/* Header with Streak Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Flame
              className={cn(
                "h-5 w-5",
                streak > 0 ? "fill-semantic-warning text-semantic-warning" : "text-meta-soft",
              )}
            />
            <h4 className="text-title-md font-bold text-ink">
              {streak > 0
                ? studiedToday
                  ? `${streak}일 연속 학습 달성!`
                  : `${streak}일 연속 학습 중`
                : "오늘의 학습을 시작해보세요!"}
            </h4>
          </div>
          <p className="text-caption text-meta">
            {streak > 0
              ? studiedToday
                ? "오늘의 복습 목표를 달성했어요! 내일도 스트릭을 이어가봐요."
                : `오늘 카드를 복습하고 ${streak + 1}일 연속 스트릭을 달성해보세요!`
              : "단어를 복습하고 매일 연속 학습 스트릭을 쌓아보세요."}
          </p>
        </div>

        {todayCount > 0 && (
          <span className="shrink-0 rounded-full bg-primary-tint px-2.5 py-1 text-caption font-semibold text-primary">
            오늘 {todayCount}개 완료
          </span>
        )}
      </div>

      {/* 7-Day Weekly Strip */}
      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
        {weeklyDays.map((day) => (
          <WeeklyDayCell key={day.dayKey} day={day} />
        ))}
      </div>
    </div>
  );
}

type WeeklyDayCellProps = {
  className?: string;
  day: VocaWeeklyDay;
};

function WeeklyDayCell({ className, day }: WeeklyDayCellProps) {
  const isCompleted = day.status === "completed";
  const isTodayPending = day.status === "today-pending";
  const isMissed = day.status === "missed";

  return (
    <div
      className={cn("flex flex-col items-center gap-1.5 text-center", className)}
      title={`${day.dayKey}: ${day.count}개 복습 완료`}
    >
      {/* Day of Week Label */}
      <span
        className={cn(
          "text-caption font-medium",
          day.isToday ? "font-bold text-primary" : "text-meta",
        )}
      >
        {day.label}
      </span>

      {/* Circle Status Chip */}
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 sm:h-11 sm:w-11",
          isCompleted &&
            (day.isToday
              ? "ring-offset-surface bg-semantic-warning text-canvas shadow-xs ring-2 ring-semantic-warning/30 ring-offset-2"
              : "border border-semantic-warning/30 bg-semantic-warning/15 text-semantic-warning"),
          isTodayPending &&
            "animate-pulse border-2 border-dashed border-semantic-warning/70 bg-surface-soft text-semantic-warning",
          isMissed && "border border-hairline/60 bg-surface-soft text-meta-soft",
          day.status === "future" &&
            "border border-hairline/30 bg-surface-soft/40 text-meta-soft/30",
        )}
        aria-label={`${day.label}요일 (${day.dayKey}): ${day.count}개 완료`}
      >
        {isCompleted ? (
          <Flame className="h-5 w-5 fill-current" />
        ) : isTodayPending ? (
          <Flame className="h-5 w-5 stroke-[1.75]" />
        ) : isMissed ? (
          <span className="h-1.5 w-1.5 rounded-full bg-meta-soft/40" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-meta-soft/20" />
        )}
      </div>

      {/* Day Number / Today Label */}
      <span
        className={cn(
          "text-[11px] leading-tight",
          day.isToday ? "font-bold text-primary" : "text-meta-soft",
        )}
      >
        {day.isToday ? "오늘" : day.dayNumber}
      </span>
    </div>
  );
}
