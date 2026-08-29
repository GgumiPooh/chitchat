import {
  EVENT_COLOR_FILL_CLASSES,
  EVENT_FALLBACK_FILL_CLASS,
  type EventColor,
} from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";

export type EventDotProps = {
  className?: string;
  color: Nullable<EventColor>;
  /** DESIGN.md § 4.1.7. `cell` is the grid's 4px; `row` is the 10px an event row carries, where a chosen colour has to be named at a glance rather than merely noticed. */
  size?: "cell" | "row";
};

/**
 * DESIGN.md § 7.9. A filled dot in the event's colour. It carries the colour and
 * nothing else — `scope` is named in words on the rows that show it (§ 11.5.),
 * a ring at this size having been indistinguishable from the fill.
 */
export function EventDot({ className, color, size = "cell" }: EventDotProps) {
  return (
    <span
      className={cn(
        "rounded-full",
        size === "row" ? "size-2.5" : "size-1",
        color ? EVENT_COLOR_FILL_CLASSES[color] : EVENT_FALLBACK_FILL_CLASS,
        className,
      )}
    />
  );
}

export type HolidayDotProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 11.7. `semantic-error` is outside the event colour set (DESIGN.md § 4.1.7.), so a red dot cannot be read as somebody's event.
export function HolidayDot({ className }: HolidayDotProps) {
  return <span className={cn("size-1 rounded-full bg-semantic-error", className)} />;
}

export type MilestoneDotProps = {
  className?: string;
};

// INFO: DESIGN.md § 7.9. A `primary` diamond, which is why `primary` is kept out of the event colour set (§ 4.1.7.) — the two must never be confusable.
export function MilestoneDot({ className }: MilestoneDotProps) {
  return <span className={cn("size-1 rotate-45 bg-primary", className)} />;
}
