import {
  EVENT_COLOR_FILL_CLASSES,
  EVENT_COLOR_RING_CLASSES,
  EVENT_FALLBACK_FILL_CLASS,
  EVENT_FALLBACK_RING_CLASS,
  type EventColor,
} from "@/shared/config";
import type { EventScope } from "@/shared/db";
import { cn, type Nullable } from "@/shared/lib";

export type EventDotProps = {
  className?: string;
  color: Nullable<EventColor>;
  scope: EventScope;
  /** DESIGN.md § 4.1.7. `cell` is the grid's 4px; `row` is the 8px an event row carries, where 4px was too small for a chosen colour to be seen. */
  size?: "cell" | "row";
};

/**
 * DESIGN.md § 7.9. A dot in the event's colour. **Shape carries scope** — a
 * `shared` event is filled and a `mine` one is a ring — because colour is already
 * spent on the event's own hue and cannot also encode whose it is.
 */
export function EventDot({ className, color, scope, size = "cell" }: EventDotProps) {
  const isMine = scope === "mine";
  const isRow = size === "row";

  return (
    <span
      className={cn(
        "rounded-full",
        isRow ? "size-2" : "size-1",
        isMine
          ? cn(
              isRow ? "border-2" : "border",
              color ? EVENT_COLOR_RING_CLASSES[color] : EVENT_FALLBACK_RING_CLASS,
            )
          : color
            ? EVENT_COLOR_FILL_CLASSES[color]
            : EVENT_FALLBACK_FILL_CLASS,
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
