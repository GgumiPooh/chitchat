import { MAX_DAY_EVENT_DOTS, WEEKDAY_LABELS } from "@/shared/config";
import { cn, formatHolidayName, formatMonthDay, SUNDAY } from "@/shared/lib";
import { EventDot, HapticTarget, MilestoneDot } from "@/shared/ui";
import type { MonthCell } from "../model/build-month-grid";

export type DayCellProps = {
  className?: string;
  cell: MonthCell;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (dayKey: string) => void;
};

/** DESIGN.md § 7.9. Square cell, numeral, then the day's markers beneath it. */
export function DayCell({ className, cell, isToday, isSelected, onSelect }: DayCellProps) {
  // INFO: The count takes a dot's place rather than sitting after all three — seven cells to a row leave no width for both.
  const isOverflowing = cell.occurrences.length > MAX_DAY_EVENT_DOTS;
  const dotCount = isOverflowing ? MAX_DAY_EVENT_DOTS - 1 : MAX_DAY_EVENT_DOTS;

  return (
    // WARN: `touch-pan-y` is repeated on the overlay, not inherited — `touch-action` applies to the element a gesture starts on, and the overlay is now that element for the grid's month swipe.
    // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the shell would stop scrolling (`DESIGN.md § 7.15.`).
    <HapticTarget className={cn("flex", className)} overlayClassName="touch-pan-y" keepsScroll>
      <button
        className={cn(
          // WARN: Seven of these tile one shell width, so the cell cannot also honour `DESIGN.md § 8.1.`'s 44px floor — 7 × 44 overflows a 320px viewport. The square is the constraint that wins; do not add a `min-w`.
          "flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected
            ? "bg-primary"
            : "group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong",
        )}
        type="button"
        // INFO: The numeral alone would read as `10`, so the name carries the date, the day's standing, and how much is on it.
        aria-current={isToday ? "date" : undefined}
        aria-label={toCellLabel(cell, isToday)}
        aria-pressed={isSelected}
        onClick={() => onSelect(cell.dayKey)}
      >
        <span className={cn("text-body-md", toNumeralClassName(cell, isToday, isSelected))}>
          {cell.dayOfMonth}
        </span>
        {/* WARN: `overflow-hidden` is the backstop — flex items refuse to shrink below min-content, so a three-figure count would otherwise spill across the grid gap into the next cell. */}
        <span className="flex h-3 max-w-full items-center gap-0.5 overflow-hidden" aria-hidden>
          {cell.milestones.length > 0 && <MilestoneDot />}
          {/* INFO: DESIGN.md § 7.9. Capped, with the remainder counted rather than dropped — three dots and nine used to be the same picture. */}
          {cell.occurrences.slice(0, dotCount).map((occurrence) => (
            <EventDot
              key={occurrence.event.id + occurrence.startsAt}
              color={occurrence.event.color}
            />
          ))}
          {isOverflowing && (
            <span className="text-micro text-meta">+{cell.occurrences.length - dotCount}</span>
          )}
        </span>
      </button>
    </HapticTarget>
  );
}

function toCellLabel(cell: MonthCell, isToday: boolean): string {
  return [
    `${formatMonthDay(cell.dayKey)} ${WEEKDAY_LABELS[cell.weekday]}요일`,
    isToday ? "오늘" : "",
    cell.holiday ? formatHolidayName(cell.holiday) : "",
    ...cell.milestones.map(({ label }) => label),
    cell.occurrences.length > 0 ? `일정 ${cell.occurrences.length}개` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function toNumeralClassName(cell: MonthCell, isToday: boolean, isSelected: boolean): string {
  if (isSelected) {
    return "text-on-primary";
  }

  // INFO: REQUIREMENTS.md § 11.7. 빨간 날 — a 공휴일 and a Sunday carry the same colour, which is the whole convention a Korean calendar is read by.
  const isRestDay = cell.holiday !== null || cell.weekday === SUNDAY;

  // INFO: DESIGN.md § 7.9. Today is weight and colour on the numeral, never a fill — the fill belongs to selection alone. Weight is what survives the numeral already being red.
  if (isToday) {
    return cn("font-bold", isRestDay ? "text-semantic-error" : "text-primary");
  }

  if (!cell.isCurrentMonth) {
    // INFO: Muted rather than dropped, or the six-row grid's edge weeks would shout louder than the month being read.
    return isRestDay ? "text-semantic-error/45" : "text-meta-soft";
  }

  return isRestDay ? "text-semantic-error" : "text-ink";
}
