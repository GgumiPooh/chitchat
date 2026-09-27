"use client";

import type { VocaHeatmapDay } from "@/entities/voca";
import { cn } from "@/shared/lib";
import { useEffect, useMemo, useRef, useState } from "react";

export type VocaHeatmapProps = {
  className?: string;
  heatmap: VocaHeatmapDay[];
  weeks?: number;
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function VocaHeatmap({ className, heatmap, weeks = 52 }: VocaHeatmapProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ dayKey: string; count: number } | null>(
    null,
  );

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollLeft = scrollerRef.current.scrollWidth;
    }
  }, []);

  const totalReviews = useMemo(() => {
    return heatmap.reduce((sum, d) => sum + d.count, 0);
  }, [heatmap]);

  const heatmapMap = useMemo(() => {
    const map = new Map<string, VocaHeatmapDay>();
    for (const item of heatmap) {
      map.set(item.dayKey, item);
    }
    return map;
  }, [heatmap]);

  // Build grid of days going backwards from today
  const gridWeeks = useMemo(() => {
    const now = new Date();
    // Shift by 4 hours for 04:00 rollover
    const effectiveNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const dayOfWeek = effectiveNow.getDay(); // 0 is Sunday

    const days: { dayKey: string; count: number; level: number }[] = [];
    const totalDays = weeks * 7;

    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(effectiveNow);
      d.setDate(d.getDate() - (i - (6 - dayOfWeek)));
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const dayKey = `${yyyy}-${mm}-${dd}`;

      const entry = heatmapMap.get(dayKey);
      days.push({
        dayKey,
        count: entry?.count ?? 0,
        level: entry?.level ?? 0,
      });
    }

    // Chunk into weeks (7 days each)
    const weeksArray: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeksArray.push(days.slice(i, i + 7));
    }
    return weeksArray;
  }, [heatmapMap, weeks]);

  const monthLabels = useMemo(() => {
    const labels: { key: string; label: string; weekIndex: number }[] = [];
    let lastMonth = "";
    let lastWeekIdx = -999;

    const now = new Date();
    const effectiveNow = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const yyyy = effectiveNow.getFullYear();
    const mm = String(effectiveNow.getMonth() + 1).padStart(2, "0");
    const dd = String(effectiveNow.getDate()).padStart(2, "0");
    const todayKey = `${yyyy}-${mm}-${dd}`;

    gridWeeks.forEach((week, wIdx) => {
      const validDays = week.filter((d) => d.dayKey <= todayKey);
      if (validDays.length === 0) {
        return;
      }

      const firstDayOfMonth = validDays.find((d) => d.dayKey.endsWith("-01"));
      let monthToLabel = "";
      if (firstDayOfMonth) {
        monthToLabel = firstDayOfMonth.dayKey.slice(5, 7);
      } else if (wIdx === 0) {
        monthToLabel = week[0].dayKey.slice(5, 7);
      }

      if (monthToLabel && monthToLabel !== lastMonth) {
        if (wIdx - lastWeekIdx >= 2) {
          labels.push({
            key: `${week[0].dayKey}-${monthToLabel}`,
            label: `${parseInt(monthToLabel, 10)}월`,
            weekIndex: wIdx,
          });
          lastMonth = monthToLabel;
          lastWeekIdx = wIdx;
        }
      }
    });

    return labels;
  }, [gridWeeks]);

  const levelColor = (level: number) => {
    switch (level) {
      case 1:
        return "bg-semantic-success/25 border-semantic-success/35";
      case 2:
        return "bg-semantic-success/50 border-semantic-success/60";
      case 3:
        return "bg-semantic-success/75 border-semantic-success/80";
      case 4:
        return "bg-semantic-success border-semantic-success";
      default:
        return "bg-surface-soft border-hairline/60";
    }
  };

  return (
    <div className={cn("bg-surface rounded-2xl border border-hairline p-4 shadow-sm", className)}>
      {/* Heatmap Row: Fixed Day Labels + Auto-Scrolled Week Grid */}
      <div className="flex items-start">
        {/* Day labels column: stays fixed on left when scrolling */}
        <div className="flex shrink-0 flex-col gap-1 pr-2 select-none" aria-hidden>
          <div className="mb-1 h-4" />
          {DAY_LABELS.map((label, idx) => (
            <span
              key={idx}
              className="flex h-3 w-4 items-center justify-start text-[10px] font-medium text-meta"
            >
              {idx % 2 === 1 ? label : ""}
            </span>
          ))}
        </div>

        {/* Responsive scroll container: auto-scrolled to today on mount */}
        <div ref={scrollerRef} className="scrollbar-hidden flex-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max flex-col">
            {/* Month labels row */}
            <div className="relative mb-1 h-4 select-none">
              {monthLabels.map((m) => (
                <span
                  key={m.key}
                  className="absolute text-[10px] font-medium text-meta"
                  style={{ left: `${m.weekIndex * 16}px` }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            {/* Week columns: 12px cells with 4px gap */}
            <div className="flex gap-1">
              {gridWeeks.map((week, wIdx) => (
                <div key={wIdx} className="flex flex-col gap-1">
                  {week.map((day) => (
                    <button
                      key={day.dayKey}
                      className={cn(
                        "h-3 w-3 rounded-[2px] border transition-transform duration-100 hover:scale-125 focus:scale-125 focus:outline-none",
                        levelColor(day.level),
                      )}
                      type="button"
                      aria-label={`${day.dayKey}: ${day.count}개 복습 완료`}
                      onMouseEnter={() =>
                        setActiveTooltip({ dayKey: day.dayKey, count: day.count })
                      }
                      onBlur={() => setActiveTooltip(null)}
                      onClick={() => setActiveTooltip({ dayKey: day.dayKey, count: day.count })}
                      onFocus={() => setActiveTooltip({ dayKey: day.dayKey, count: day.count })}
                      onMouseLeave={() => setActiveTooltip(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Summary / Tooltip on Left, Legend on Right (GitHub standard) */}
      <div className="mt-3 flex items-center justify-between border-t border-hairline-soft pt-3 text-caption text-meta">
        <div className="flex h-5 items-center">
          {activeTooltip ? (
            <span className="animate-in font-semibold text-semantic-success duration-100 fade-in-50">
              {activeTooltip.dayKey}: {activeTooltip.count}개 복습 완료
            </span>
          ) : (
            <span>
              {totalReviews > 0
                ? `최근 1년간 총 ${totalReviews.toLocaleString()}개 복습 완료`
                : "날짜를 누르거나 마우스를 올리면 복습량을 확인할 수 있어요"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span>적음</span>
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px] border border-hairline/60 bg-surface-soft" />
            <span className="h-2.5 w-2.5 rounded-[2px] border border-semantic-success/35 bg-semantic-success/25" />
            <span className="h-2.5 w-2.5 rounded-[2px] border border-semantic-success/60 bg-semantic-success/50" />
            <span className="h-2.5 w-2.5 rounded-[2px] border border-semantic-success/80 bg-semantic-success/75" />
            <span className="h-2.5 w-2.5 rounded-[2px] border border-semantic-success bg-semantic-success" />
          </div>
          <span>많음</span>
        </div>
      </div>
    </div>
  );
}
