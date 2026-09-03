"use client";

import type { EventOccurrence } from "@/entities/event";
import {
  cn,
  formatYearMonth,
  shiftMonthKey,
  toMonthKey,
  toMonthStart,
  type HolidayTable,
} from "@/shared/lib";
import { Chip, IconButton } from "@/shared/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildMonthGrid, type MonthCell } from "../model/build-month-grid";
import { useMonthCarousel } from "../model/use-month-carousel";
import { DayCell } from "./day-cell";
import { WeekdayHeader } from "./weekday-header";

export type CalendarMonthProps = {
  className?: string;
  monthKey: string;
  startDate: string;
  todayKey: string;
  selectedDayKey: string;
  occurrences: EventOccurrence[];
  /** REQUIREMENTS.md § 11.7. Resolved on the server and handed down whole, so a swipe reads it without a request. */
  holidays: HolidayTable;
  /** REQUIREMENTS.md § 11.3. Off for the offline mirror (§ 16.2.) — see `useMonthCarousel`. */
  isPaged?: boolean;
  onMonthChange: (monthKey: string) => void;
  onSelectDay: (dayKey: string) => void;
};

const GRID_CLASS_NAME = "square-grid-7 [--square-grid-gap:calc(var(--spacing)*0.5)]";

/** DESIGN.md § 7.9. Month label with chevrons, weekday header, then six weeks of cells. */
export function CalendarMonth({
  className,
  monthKey,
  startDate,
  todayKey,
  selectedDayKey,
  occurrences,
  holidays,
  isPaged = true,
  onMonthChange,
  onSelectDay,
}: CalendarMonthProps) {
  const todayMonthKey = toMonthKey(todayKey);
  const { trackClassName, trackStyle, dragHandlers, goToPrev, goToNext, onTrackTransitionEnd } =
    useMonthCarousel(monthKey, isPaged, onMonthChange);

  return (
    <section className={cn("space-y-xs", className)} aria-label="월별 일정">
      {/* WARN: DESIGN.md § 7.9. A grid rather than `justify-between`, so the centre column holds the label against the middle of the row however wide the sides get. Under `justify-between` the 오늘 chip appearing would push the label off centre and shift it back on every return to this month. */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center">
        <IconButton
          className="justify-self-start"
          Icon={ChevronLeft}
          haptic
          aria-label="이전 달"
          onClick={goToPrev}
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
          <IconButton Icon={ChevronRight} haptic aria-label="다음 달" onClick={goToNext} />
        </div>
      </header>

      <WeekdayHeader />

      {isPaged ? (
        // INFO: DESIGN.md § 7.9. `[container-type:inline-size]` makes this box, not the track's own three-times-width one, the reference for the track's `cqw` offsets (`useMonthCarousel`).
        <div className="[container-type:inline-size] touch-pan-y overflow-hidden" {...dragHandlers}>
          <div
            className={cn("flex w-[300cqw]", trackClassName)}
            style={trackStyle}
            onTransitionEnd={onTrackTransitionEnd}
          >
            {[shiftMonthKey(monthKey, -1), monthKey, shiftMonthKey(monthKey, 1)].map(
              (gridMonthKey) => (
                <div key={gridMonthKey} className={cn(GRID_CLASS_NAME, "w-1/3 shrink-0")}>
                  {renderCells(buildMonthGrid(gridMonthKey, startDate, occurrences, holidays))}
                </div>
              ),
            )}
          </div>
        </div>
      ) : (
        <div className={cn(GRID_CLASS_NAME, "touch-pan-y")} {...dragHandlers}>
          {renderCells(buildMonthGrid(monthKey, startDate, occurrences, holidays))}
        </div>
      )}
    </section>
  );

  function renderCells(cells: MonthCell[]) {
    return cells.map((cell) => (
      <DayCell
        key={cell.dayKey}
        cell={cell}
        isToday={cell.dayKey === todayKey}
        isSelected={cell.dayKey === selectedDayKey}
        onSelect={onSelectDay}
      />
    ));
  }
}
