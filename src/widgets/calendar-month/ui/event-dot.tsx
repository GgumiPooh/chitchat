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
};

/**
 * DESIGN.md § 7.9. 4px dot in the event's colour. **Shape carries scope** — a
 * `shared` event is filled and a `mine` one is a ring — because colour is already
 * spent on the event's own hue and cannot also encode whose it is.
 */
export function EventDot({ className, color, scope }: EventDotProps) {
  const isMine = scope === "mine";

  return (
    <span
      className={cn(
        "size-1 rounded-full",
        isMine
          ? cn("border", color ? EVENT_COLOR_RING_CLASSES[color] : EVENT_FALLBACK_RING_CLASS)
          : color
            ? EVENT_COLOR_FILL_CLASSES[color]
            : EVENT_FALLBACK_FILL_CLASS,
        className,
      )}
    />
  );
}

export type MilestoneDotProps = {
  className?: string;
};

// INFO: DESIGN.md § 7.9. A `primary` diamond, which is why `primary` is kept out of the event colour set (§ 4.1.7.) — the two must never be confusable.
export function MilestoneDot({ className }: MilestoneDotProps) {
  return <span className={cn("size-1 rotate-45 bg-primary", className)} />;
}
