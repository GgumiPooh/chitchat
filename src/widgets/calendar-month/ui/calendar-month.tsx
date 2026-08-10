"use client";

import type { EventOccurrence } from "@/entities/event";
import { WEEKDAY_LABELS } from "@/shared/config";
import {
  cn,
  formatYearMonth,
  SATURDAY,
  shiftMonthKey,
  SUNDAY,
  toMonthKey,
  toMonthStart,
} from "@/shared/lib";
import { Chip, IconButton } from "@/shared/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildMonthGrid } from "../model/build-month-grid";
import { useMonthSwipe } from "../model/use-month-swipe";
import { DayCell } from "./day-cell";

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
  const todayMonthKey = toMonthKey(todayKey);
  const swipeHandlers = useMonthSwipe((direction) =>
    onMonthChange(shiftMonthKey(monthKey, direction)),
  );

  return (
    <section className={cn("space-y-xs", className)} aria-label="월별 일정">
      {/* WARN: DESIGN.md § 7.9. A grid rather than `justify-between`, so the centre column holds the label against the middle of the row however wide the sides get. Under `justify-between` the 오늘 chip appearing would push the label off centre and shift it back on every return to this month. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <IconButton
          className="justify-self-start"
          Icon={ChevronLeft}
          haptic
          aria-label="이전 달"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
        />
        {/* WARN: Not a live region. Changing the month always moves the selection with it, and the agenda's heading announces the whole date — two live headings mutating in one commit is two announcements for one tap. */}
        <h2 className="text-display-md whitespace-nowrap text-ink">
          {formatYearMonth(toMonthStart(monthKey))}
        </h2>
        <div className="flex items-center gap-2xs justify-self-end">
          {/* INFO: REQUIREMENTS.md § 11.3. Withheld only once the tap would move nothing — today's own month with today already selected. */}
          {!(monthKey === todayMonthKey && selectedDayKey === todayKey) && (
            <Chip haptic onClick={() => onSelectDay(todayKey)}>
              오늘
            </Chip>
          )}
          <IconButton
            Icon={ChevronRight}
            haptic
            aria-label="다음 달"
            onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
          />
        </div>
      </header>

      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((label, index) => (
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

// INFO: DESIGN.md § 7.9. Sunday `semantic-error`, Saturday `primary`; the rest `meta`.
function toWeekdayClassName(index: number): string {
  if (index === SUNDAY) {
    return "text-semantic-error";
  }

  return index === SATURDAY ? "text-primary" : "text-meta";
}
