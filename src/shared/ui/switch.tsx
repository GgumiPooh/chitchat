"use client";

import { cn } from "@/shared/lib";
import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { HapticTap } from "./haptic-tap";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  className?: string;
  trackClassName?: string;
  thumbClassName?: string;
  /** Ticks the Taptic engine when a finger lands on the track. */
  haptic?: boolean;
};

// INFO: DESIGN.md § 7.11. A settings-row control: 28 tall so the 56 row keeps its vertical rhythm, and the track carries the state colour since the row itself never changes fill.
export function Switch({
  className,
  trackClassName,
  thumbClassName,
  haptic = false,
  disabled,
  ...props
}: SwitchProps) {
  // INFO: A disabled track toggles nothing, and the overlay would still take the tap and tick.
  const hasHaptic = haptic && !disabled;

  return (
    // WARN: The overlay is a sibling of the track, never a child. `Root` renders a `<button>`, and a native `input[switch]` inside one swallows the tap whole — the track stops toggling at all.
    <span className={cn("group relative inline-flex", className)}>
      <SwitchPrimitive.Root
        className={cn(
          "inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
          "bg-hairline-strong hover:bg-meta-soft data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary-hover",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:opacity-50",
          trackClassName,
        )}
        disabled={disabled}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            // INFO: DESIGN.md § 4.5. A 1px hairline is the system's elevation; a shadow here would break § 8.2., which bans them on resting surfaces.
            "pointer-events-none block size-6 rounded-full border border-hairline-strong bg-canvas transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
            thumbClassName,
          )}
        />
      </SwitchPrimitive.Root>
      {/* INFO: The tap is forwarded as a click rather than read off `checked` — a click is what `Root` already listens to, so controlled and uncontrolled switches both keep working. */}
      {hasHaptic && <HapticTap forwardsTap />}
    </span>
  );
}
