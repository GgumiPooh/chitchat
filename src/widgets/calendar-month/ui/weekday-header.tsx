import { WEEKDAY_LABELS } from "@/shared/config";
import { cn, SATURDAY, SUNDAY } from "@/shared/lib";

export type WeekdayHeaderProps = {
  className?: string;
};

/**
 * DESIGN.md § 7.9. The grid's weekday row.
 *
 * INFO: Its own component so the month's `<Suspense>` fallback can draw the real
 * labels rather than seven placeholders — nothing here depends on the month, the
 * events or the clock, so a skeleton of it would be a swap for identical pixels.
 */
export function WeekdayHeader({ className }: WeekdayHeaderProps) {
  return (
    <div className={cn("grid grid-cols-7", className)}>
      {WEEKDAY_LABELS.map((label, index) => (
        <span
          key={label}
          className={cn("py-2xs text-center text-caption", toWeekdayClassName(index))}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

// INFO: DESIGN.md § 7.9. Sunday `semantic-error`, Saturday `primary`; the rest `meta`.
function toWeekdayClassName(index: number): string {
  if (index === SUNDAY) {
    return "text-semantic-error";
  }

  return index === SATURDAY ? "text-primary" : "text-meta";
}
