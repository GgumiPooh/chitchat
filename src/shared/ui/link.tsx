import { cn } from "@/shared/lib";
import NextLink from "next/link";
import type { ComponentProps } from "react";
import { HapticTap } from "./haptic-tap";

export type LinkProps = ComponentProps<typeof NextLink> & {
  className?: string;
  /** Ticks the Taptic engine when a finger lands on the link. For an app route only — see the warning below. Off for links that navigate nowhere new. */
  haptic?: boolean;
};

// WARN: `haptic` is for internal routes only. The overlay becomes the click target, so the anchor's own activation never runs and navigation rides entirely on `NextLink`'s handler — which bows out without it for an external href, a `target`, or a modified click, and those would then go nowhere.
// INFO: The overlay pairs with `relative` and has to stay the last child; owning both here keeps a caller from silently losing the haptic by restyling around it.
export function Link({ className, haptic = false, children, ...props }: LinkProps) {
  return (
    <NextLink className={cn(haptic && "relative", className)} {...props}>
      {children}
      {haptic && <HapticTap />}
    </NextLink>
  );
}
