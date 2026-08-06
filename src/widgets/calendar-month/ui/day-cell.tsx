import { MAX_DAY_EVENT_DOTS } from "@/shared/config";
import { cn } from "@/shared/lib";
import { HapticTap } from "@/shared/ui";
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
    <span className={cn("group relative flex", className)}>
      <button
        className={cn(
          "flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
          isSelected
            ? "bg-primary"
            : "group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong",
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
      {/* WARN: `touch-pan-y` is repeated here, not inherited — `touch-action` applies to the element a gesture starts on, and the overlay is now that element for the grid's month swipe. */}
      {/* WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the shell would stop scrolling (`DESIGN.md § 7.15.`). */}
      <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
    </span>
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
