import { cn } from "@/shared/lib";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

export type ChipProps = ComponentProps<"button"> & {
  className?: string;
  isSelected?: boolean;
  asChild?: boolean;
};

// INFO: DESIGN.md § 7.1. Selected chips take no hover change — selection is a state, not a hover target.
export function Chip({ className, isSelected = false, asChild, ...props }: ChipProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-xs rounded-full px-3.5 py-xs text-button-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-50",
        isSelected
          ? "bg-primary-tint text-primary active:bg-primary-tint/80"
          : "bg-surface-soft text-body hover:bg-surface-strong active:bg-surface-pressed",
        className,
      )}
      {...props}
    />
  );
}
