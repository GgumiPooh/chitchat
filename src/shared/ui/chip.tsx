import { cn } from "@/shared/lib";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { HapticTarget } from "./haptic-target";

export type ChipProps = ComponentProps<"button"> & {
  className?: string;
  /** WARN: The chip's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — padding, radius, colour. */
  chipClassName?: string;
  isSelected?: boolean;
  asChild?: boolean;
  /** Ticks the Taptic engine when a finger lands on the chip. Silent on the chip already selected, which chooses nothing. */
  haptic?: boolean;
};

// INFO: DESIGN.md § 7.1. Selected chips take no hover change — selection is a state, not a hover target.
// WARN: With `haptic`, `className` lands on the wrapper rather than the chip — the wrapper is what the parent lays out. Anything about the chip's own box goes to `chipClassName`.
export function Chip({
  className,
  chipClassName,
  isSelected = false,
  asChild,
  haptic = false,
  disabled,
  ...props
}: ChipProps) {
  const Comp = asChild ? Slot.Root : "button";
  // INFO: A refusal confirms nothing, exactly as a selected chip and a disabled one do not — see `Button`.
  const isTicking =
    !isSelected &&
    !disabled &&
    props["aria-disabled"] !== true &&
    props["aria-disabled"] !== "true";

  const chip = (
    <Comp
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-xs rounded-full px-3.5 py-xs text-button-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "bg-primary-tint text-primary group-active:bg-primary-tint/80 active:bg-primary-tint/80"
          : "bg-surface-soft text-body group-active:bg-surface-pressed hover:bg-surface-strong active:bg-surface-pressed",
        // WARN: `chipClassName` applies in **both** branches — see `Button`, where a toggled `haptic` dropped the control's own box and handed it the wrapper's layout instead.
        !haptic && className,
        chipClassName,
      )}
      disabled={disabled}
      {...props}
    />
  );

  if (!haptic) {
    return chip;
  }

  return (
    <HapticTarget className={cn("inline-flex shrink-0", className)} isTicking={isTicking}>
      {chip}
    </HapticTarget>
  );
}
