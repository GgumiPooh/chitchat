"use client";

import type { EventOccurrence } from "@/entities/event";
import { cn, formatYearMonth, shiftMonthKey, toMonthStart } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildMonthGrid } from "../model/build-month-grid";
import { useMonthSwipe } from "../model/use-month-swipe";
import { DayCell } from "./day-cell";

// INFO: DESIGN.md § 7.9. Sunday `semantic-error`, Saturday `primary`; the rest `meta`.
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export type CalendarMonthProps = {
  className?: string;
  monthKey: string;
  startDate: string;
  todayKey: string;
  selectedDayKey: string;
  occurrences: EventOccurrence[];
  onMonthChange: (monthKey: string) => void;
  onSelectDay: (dayKey: string) => void;
};

/** DESIGN.md § 7.9. Month label with chevrons, weekday header, then six weeks of cells. */
export function CalendarMonth({
  className,
  monthKey,
  startDate,
  todayKey,
  selectedDayKey,
  occurrences,
  onMonthChange,
  onSelectDay,
}: CalendarMonthProps) {
  const cells = buildMonthGrid(monthKey, startDate, occurrences);
  const swipeHandlers = useMonthSwipe((direction) =>
    onMonthChange(shiftMonthKey(monthKey, direction)),
  );

  return (
    <section className={cn("space-y-xs", className)} aria-label="월별 일정">
      <header className="flex items-center justify-between">
        <IconButton
          Icon={ChevronLeft}
          haptic
          aria-label="이전 달"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
        />
        <h2 className="text-display-md text-ink">{formatYearMonth(toMonthStart(monthKey))}</h2>
        <IconButton
          Icon={ChevronRight}
          haptic
          aria-label="다음 달"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
        />
      </header>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map((label, index) => (
          <span
            key={label}
            className={cn("py-2xs text-center text-caption", toWeekdayClassName(index))}
          >
            {label}
          </span>
        ))}
      </div>

      {/* WARN: `touch-action: pan-y` — without it WebKit claims the horizontal gesture for its own back-navigation swipe and the pointer events below never complete. */}
      <div className="grid touch-pan-y grid-cols-7 gap-0.5" {...swipeHandlers}>
        {cells.map((cell) => (
          <DayCell
            key={cell.dayKey}
            cell={cell}
            isToday={cell.dayKey === todayKey}
            isSelected={cell.dayKey === selectedDayKey}
            onSelect={onSelectDay}
          />
        ))}
      </div>
    </section>
  );
}

function toWeekdayClassName(index: number): string {
  if (index === 0) {
    return "text-semantic-error";
  }

  return index === 6 ? "text-primary" : "text-meta";
}
