import { cn } from "@/shared/lib";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { HapticTap } from "./haptic-tap";

export type ChipProps = ComponentProps<"button"> & {
  className?: string;
  isSelected?: boolean;
  asChild?: boolean;
  /** Ticks the Taptic engine when a finger lands on the chip. Silent on the chip already selected, which chooses nothing. */
  haptic?: boolean;
};

// INFO: DESIGN.md § 7.1. Selected chips take no hover change — selection is a state, not a hover target.
export function Chip({
  className,
  isSelected = false,
  asChild,
  haptic = false,
  disabled,
  ...props
}: ChipProps) {
  const Comp = asChild ? Slot.Root : "button";
  const isTicking = !isSelected && !disabled;

  const chip = (
    <Comp
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-xs rounded-full px-3.5 py-xs text-button-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "bg-primary-tint text-primary group-active:bg-primary-tint/80 active:bg-primary-tint/80"
          : "bg-surface-soft text-body group-active:bg-surface-pressed hover:bg-surface-strong active:bg-surface-pressed",
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );

  if (!haptic) {
    return chip;
  }

  return (
    // WARN: The wrapper follows `haptic` alone, never the selection. Gating it on state too swaps this position between `<span>` and `<button>`, and React then remounts the chip and drops the focus a keyboard user was holding.
    // WARN: A sibling directly after the chip, never a child. Inside a `<button>` WebKit ends the tap in the native control and no click reaches JS at all.
    <span className="group relative inline-flex shrink-0">
      {chip}
      {isTicking && <HapticTap forwardsTap />}
    </span>
  );
}
