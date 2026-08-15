"use client";

import { cn } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { HapticTarget } from "./haptic-target";

export type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  className?: string;
  trackClassName?: string;
  thumbClassName?: string;
  /** Ticks the Taptic engine when a finger lands on the track. */
  haptic?: boolean;
  /** Refuses the tap while the device is offline, since every switch in the app writes to the server. */
  isOfflineGated?: boolean;
};

// INFO: DESIGN.md § 7.11. A settings-row control: 28 tall so the 56 row keeps its vertical rhythm, and the track carries the state colour since the row itself never changes fill.
export function Switch({
  className,
  trackClassName,
  thumbClassName,
  haptic = false,
  isOfflineGated = false,
  disabled,
  onCheckedChange,
  ...props
}: SwitchProps) {
  const { isBlocked, blockedProps, refuse } = useOfflineGate(
    OFFLINE_MESSAGES.change,
    isOfflineGated,
  );
  // INFO: A disabled track toggles nothing, and the overlay would still take the tap and tick.
  const hasHaptic = haptic && !disabled && !isBlocked;

  return (
    // WARN: `Root` renders a `<button>`, and a native `input[switch]` inside one swallows the tap whole — the track stops toggling at all. `HapticTarget` is what keeps the overlay a sibling.
    // INFO: The tap is forwarded as a click rather than read off `checked` — a click is what `Root` already listens to, so controlled and uncontrolled switches both keep working.
    <HapticTarget className={cn("inline-flex", className)} isTicking={hasHaptic}>
      <SwitchPrimitive.Root
        className={cn(
          "inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
          "bg-hairline-strong hover:bg-meta-soft data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary-hover",
          "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // WARN: It dims and the thumb below does **not** move. A switch that answers the tap and then snaps back reports a preference the server never took, and a wash keeps the state it is still truthfully reporting legible where a flat fill would erase it.
          isBlocked && "cursor-not-allowed opacity-50",
          trackClassName,
        )}
        disabled={disabled}
        {...blockedProps}
        onCheckedChange={handleCheckedChange}
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
    </HapticTarget>
  );

  function handleCheckedChange(next: boolean) {
    if (isBlocked) {
      refuse();

      return;
    }

    onCheckedChange?.(next);
  }
}
