import { cn, type Nullable } from "@/shared/lib";
import { formatDayLabel } from "../model/format-day-label";
import { DAY_PILL_CLASS } from "./date-divider";

export type DayIndicatorProps = {
  className?: string;
  /** The day the topmost visible row belongs to. Null before the list has one, which is also the resting state of an empty window. */
  dayKey: Nullable<string>;
  isVisible: boolean;
};

/**
 * REQUIREMENTS.md § 8.3. Which day the reader is currently in, floating over the
 * list rather than scrolling with it — the § 6.4. dividers are list items and pass
 * out of view, so mid-history there is otherwise nothing on screen that says.
 *
 * WARN: An overlay, never a `sticky` row. Every row here is absolutely positioned
 * by the virtualizer (§ 8.3.), so `position: sticky` has no flow to stick inside,
 * and a divider that has scrolled out is not in the DOM at all to be pinned.
 *
 * WARN: `pointer-events-none`. It sits over the bubbles at the top of the column,
 * which are the § 8.10. swipe target and the § 8.11. hold target alike.
 */
export function DayIndicator({ className, dayKey, isVisible }: DayIndicatorProps) {
  // INFO: The pill is kept mounted through its own fade, so the label may not be dropped the moment the day resolves to nothing.
  if (!dayKey) {
    return null;
  }

  return (
    <div
      className={cn(
        "pointer-events-none flex justify-center transition-opacity duration-150",
        isVisible ? "opacity-100" : "opacity-0",
        className,
      )}
      aria-hidden
    >
      {/* INFO: DESIGN.md § 7.16. `shadow-raised` where the divider in the list has none — this one floats over bubbles and a wallpaper rather than sitting between rows. */}
      <span className={cn(DAY_PILL_CLASS, "shadow-raised")}>{formatDayLabel(dayKey)}</span>
    </div>
  );
}
