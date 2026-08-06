import { cn } from "@/shared/lib";
import type { ComponentProps, FC } from "react";
import { HapticTap } from "./haptic-tap";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  className?: string;
  iconClassName?: string;
  Icon: FC<ComponentProps<"svg">>;
  variant?: "plain" | "floating";
  /** Ticks the Taptic engine when a finger lands on the button. Only for a button the caller does not position itself — it gains a wrapper. */
  haptic?: boolean;
  "aria-label": string;
};

// INFO: DESIGN.md § 7.1. `floating` is the variant that sits over content, so it carries its own surface to stay legible against whatever scrolls beneath it.
const VARIANT_CLASS_NAME: Record<NonNullable<IconButtonProps["variant"]>, string> = {
  plain:
    "bg-transparent text-meta hover:bg-surface-soft hover:text-ink active:bg-surface-strong group-active:bg-surface-strong",
  floating:
    "glass border border-hairline text-ink shadow-floating hover:bg-canvas active:bg-surface-soft group-active:bg-surface-soft",
};

// INFO: DESIGN.md § 3.2., § 7.1. The 44 target pads a 20 glyph, and the ring takes no offset.
export function IconButton({
  className,
  iconClassName,
  Icon,
  variant = "plain",
  haptic = false,
  disabled,
  type = "button",
  ...props
}: IconButtonProps) {
  // INFO: A disabled button confirms nothing, and the overlay would still take the tap and tick.
  const isTicking = !disabled;

  const button = (
    <button
      className={cn(
        // INFO: DESIGN.md § 4.7.2. The bloom is what a round control has instead of a fill change large enough to see — the circle is 44px and the fill sits under the finger.
        "inline-flex size-11 shrink-0 press-bloom cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT_CLASS_NAME[variant],
        className,
      )}
      disabled={disabled}
      type={type}
      {...props}
    >
      <Icon className={cn("pointer-events-none size-5", iconClassName)} strokeWidth={1.75} />
    </button>
  );

  if (!haptic) {
    return button;
  }

  return (
    // WARN: The wrapper shrink-wraps the button, so `className` sizing still governs — but a caller that positions the button itself (`absolute`, `flex-1`) must not ask for `haptic`, since those classes would land on the button inside the wrapper rather than on the box its parent lays out.
    // WARN: The wrapper follows `haptic` alone, never `disabled`. Gating it on state too swaps this position between `<span>` and `<button>`, and React then remounts the button and drops the focus a keyboard user was holding.
    <span className="group relative inline-flex shrink-0">
      {button}
      {/* WARN: A sibling directly after the button, never a child. Inside a `<button>` WebKit ends the tap in the native control and no click reaches JS at all. */}
      {isTicking && <HapticTap forwardsTap />}
    </span>
  );
}
