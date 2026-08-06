import { MAX_DAY_EVENT_DOTS } from "@/shared/config";
import { cn } from "@/shared/lib";
import type { MonthCell } from "../model/build-month-grid";
import { EventDot, MilestoneDot } from "./event-dot";

export type DayCellProps = {
  className?: string;
  cell: MonthCell;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (dayKey: string) => void;
};

/** DESIGN.md § 7.9. Square cell, numeral, then up to three markers beneath it. */
export function DayCell({ className, cell, isToday, isSelected, onSelect }: DayCellProps) {
  return (
    // WARN: No `HapticTap` here, by `DESIGN.md § 7.15.` — the cells tile the grid, so an overlay on them is what every scrolling and swiping finger lands on.
    <button
      className={cn(
        "flex aspect-square cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        isSelected ? "bg-primary" : "hover:bg-surface-soft active:bg-surface-strong",
        className,
      )}
      type="button"
      aria-pressed={isSelected}
      onClick={() => onSelect(cell.dayKey)}
    >
      <span className={cn("text-body-md", toNumeralClassName(cell, isToday, isSelected))}>
        {cell.dayOfMonth}
      </span>
      <span className="flex h-1 items-center gap-0.5">
        {cell.milestones.length > 0 && <MilestoneDot />}
        {/* INFO: DESIGN.md § 7.9. Capped at three — a busy day is a cell that says "several", not a cell that counts. */}
        {cell.occurrences.slice(0, MAX_DAY_EVENT_DOTS).map((occurrence) => (
          <EventDot
            key={occurrence.event.id + occurrence.startsAt}
            color={occurrence.event.color}
            scope={occurrence.event.scope}
          />
        ))}
      </span>
    </button>
  );
}

function toNumeralClassName(cell: MonthCell, isToday: boolean, isSelected: boolean): string {
  if (isSelected) {
    return "text-on-primary";
  }

  // INFO: DESIGN.md § 7.9. Today is weight and colour on the numeral, never a fill — the fill belongs to selection alone.
  if (isToday) {
    return "font-bold text-primary";
  }

  return cell.isCurrentMonth ? "text-ink" : "text-meta-soft";
}
