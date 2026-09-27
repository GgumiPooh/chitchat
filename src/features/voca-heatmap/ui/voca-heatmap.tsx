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

  const levelColor = (level: number) => {
    switch (level) {
      case 1:
        return "bg-primary/25 border-primary/30";
      case 2:
        return "bg-primary/50 border-primary/60";
      case 3:
        return "bg-primary/75 border-primary/80";
      case 4:
        return "bg-primary border-primary";
      default:
        return "bg-surface-soft border-hairline/40";
    }
  };

  return (
    <div className={cn("bg-surface rounded-2xl border border-hairline p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between pb-3">
        <h4 className="text-body-sm font-semibold text-ink">학습 잔디</h4>
        <div className="flex items-center gap-1.5 text-caption text-meta">
          <span>적음</span>
          <div className="flex gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-hairline/40 bg-surface-soft" />
            <span className="h-2.5 w-2.5 rounded-sm border border-primary/30 bg-primary/25" />
            <span className="h-2.5 w-2.5 rounded-sm border border-primary/60 bg-primary/50" />
            <span className="h-2.5 w-2.5 rounded-sm border border-primary/80 bg-primary/75" />
            <span className="h-2.5 w-2.5 rounded-sm border border-primary bg-primary" />
          </div>
          <span>많음</span>
        </div>
      </div>

      <div className="mb-2 flex h-5 items-center justify-center text-caption">
        {activeTooltip ? (
          <span className="animate-in font-semibold text-primary duration-100 fade-in-50">
            {activeTooltip.dayKey}: {activeTooltip.count}개 복습 완료
          </span>
        ) : (
          <span className="text-meta">
            {totalReviews > 0
              ? `최근 1년간 총 ${totalReviews.toLocaleString()}개 복습 완료`
              : "날짜를 누르거나 마우스를 올리면 복습량을 확인할 수 있어요"}
          </span>
        )}
      </div>

      {/* Responsive scroll container: auto-scrolled to today on mount */}
      <div ref={scrollerRef} className="scrollbar-hidden overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {/* Day labels column */}
          <div className="flex flex-col gap-1 pr-1">
            {DAY_LABELS.map((label, idx) => (
              <span
                key={idx}
                className="flex h-3.5 w-3.5 items-center justify-center text-[9px] font-medium text-meta"
              >
                {idx % 2 === 1 ? label : ""}
              </span>
            ))}
          </div>

          {/* Week columns */}
          {gridWeeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((day) => (
                <button
                  key={day.dayKey}
                  className={cn(
                    "h-3.5 w-3.5 rounded-sm border transition-transform duration-100 hover:scale-125 focus:scale-125 focus:outline-none",
                    levelColor(day.level),
                  )}
                  type="button"
                  aria-label={`${day.dayKey}: ${day.count}개 복습 완료`}
                  onBlur={() => setActiveTooltip(null)}
                  onClick={() => setActiveTooltip({ dayKey: day.dayKey, count: day.count })}
                  onFocus={() => setActiveTooltip({ dayKey: day.dayKey, count: day.count })}
                  onMouseEnter={() => setActiveTooltip({ dayKey: day.dayKey, count: day.count })}
                  onMouseLeave={() => setActiveTooltip(null)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
