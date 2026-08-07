import { cn } from "@/shared/lib";
import type { ComponentProps, FC } from "react";
import { HapticTarget } from "./haptic-target";

export type IconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  className?: string;
  /** WARN: The button's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — size, radius, colour. */
  buttonClassName?: string;
  iconClassName?: string;
  Icon: FC<ComponentProps<"svg">>;
  variant?: "plain" | "floating";
  /** Ticks the Taptic engine when a finger lands on the button. */
  haptic?: boolean;
  /** WARN: Only does anything alongside `haptic`, since it is the overlay it configures — the button alone never moves focus. Beside a focused field it is required, or the overlay takes the tap, the field blurs, and iOS drops the keyboard. */
  keepsFocus?: boolean;
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
// WARN: With `haptic`, `className` lands on the wrapper rather than the button (`AGENTS.md § 1.2.`) — the wrapper is what the parent lays out, so `absolute` and `flex-1` have to reach it. Anything about the button's own box goes to `buttonClassName`.
export function IconButton({
  className,
  buttonClassName,
  iconClassName,
  Icon,
  variant = "plain",
  haptic = false,
  keepsFocus = false,
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
        haptic ? buttonClassName : className,
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
    <HapticTarget
      className={cn("inline-flex shrink-0", className)}
      isTicking={isTicking}
      keepsFocus={keepsFocus}
    >
      {button}
    </HapticTarget>
  );
}
