import { cn } from "@/shared/lib";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { HapticTarget } from "./haptic-target";

// INFO: DESIGN.md § 7.1. 48 tall, not the 44 tap-target floor: full-width buttons read cramped at 44.
const buttonVariants = cva(
  "inline-flex min-h-12 w-full shrink-0 cursor-pointer items-center justify-center gap-xs rounded-md px-md py-sm text-button-md whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-on-primary group-active:bg-primary-pressed hover:bg-primary-hover active:bg-primary-pressed disabled:bg-primary-disabled",
        secondary:
          "border border-hairline-strong bg-canvas text-ink group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong disabled:opacity-50",
        ghost:
          "bg-transparent text-ink group-active:bg-surface-strong hover:bg-surface-soft active:bg-surface-strong disabled:opacity-50",
        destructive:
          "bg-semantic-error text-on-semantic-error group-active:bg-semantic-error-pressed hover:bg-semantic-error-hover active:bg-semantic-error-pressed disabled:opacity-50",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    /** WARN: The button's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — padding, radius, colour. */
    buttonClassName?: string;
    asChild?: boolean;
    /** Ticks the Taptic engine when a finger lands on the button. */
    haptic?: boolean;
  };

// WARN: With `haptic`, `className` lands on the wrapper rather than the button — the wrapper is what the parent lays out, so `flex-1` and `w-auto` have to reach it. Anything about the button's own box goes to `buttonClassName`.
export function Button({
  className,
  buttonClassName,
  variant,
  asChild,
  haptic = false,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  const button = (
    <Comp
      className={cn(buttonVariants({ variant }), haptic ? buttonClassName : className)}
      disabled={disabled}
      type={asChild ? undefined : type}
      {...props}
    />
  );

  if (!haptic) {
    return button;
  }

  return (
    // WARN: The wrapper stands whether or not the button is disabled — dropping it there would hand `className` back to the button, and a disabled `삭제` would take the wrapper's `flex-1` as its own styling.
    // INFO: A disabled button confirms nothing, and the overlay would still take the tap and tick.
    // WARN: `keepsScroll` — a full-width button is a large piece of a scrolling screen, and the bare switch overlay is a native control that keeps a drag of its own. Without it a finger that lands on 추가하기 and pulls scrolls nothing at all, which reads as a frozen page rather than as a button (`jandh DESIGN.md § 7.15.1.`).
    <HapticTarget
      className={cn("flex w-full", className)}
      overlayClassName="touch-pan-y"
      isTicking={!disabled}
      keepsScroll
    >
      {button}
    </HapticTarget>
  );
}
