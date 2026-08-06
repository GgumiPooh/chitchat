import { cn } from "@/shared/lib";
import type { PropsWithChildren, Ref } from "react";
import { HapticTap } from "./haptic-tap";

export type HapticTargetProps = PropsWithChildren<{
  /** The wrapper is what the parent lays out, so it is also what a caller measures or scrolls into view. */
  ref?: Ref<HTMLSpanElement>;
  className?: string;
  /** The overlay's own box — `touch-pan-y` for a target that tiles a scroller. */
  overlayClassName?: string;
  /**
   * Silences the tick while leaving the wrapper standing. A disabled button and a
   * chip that is already selected confirm nothing.
   *
   * WARN: Never gate the *wrapper* on this. Swapping the control's position between
   * `<span>` and `<button>` remounts it, and a keyboard user loses the focus they
   * were holding.
   */
  isTicking?: boolean;
  keepsFocus?: boolean;
  keepsScroll?: boolean;
}>;

/**
 * The wrapper an interactive element needs before `HapticTap` can sit beside it:
 * `relative`, so the overlay can stretch over it, and `group`, so the control can
 * mirror the press it no longer receives itself.
 *
 * The caller supplies the display class — `inline-flex shrink-0` for a button that
 * shrink-wraps, `flex w-full` for a row — since the wrapper is what the parent lays
 * out from here on.
 *
 * WARN: `className` belongs to this element, not to the control inside it
 * (`AGENTS.md § 1.2.`). A primitive that takes `haptic` therefore routes its own
 * `className` here and exposes a second prop for the control's box — six copies of
 * this contract had already drifted apart on exactly that point.
 *
 * WARN: The overlay is a *sibling* of the control, never a child. Inside a
 * `<button>` WebKit ends the tap in the native control and no click reaches JS at
 * all — see `HapticTap`.
 */
export function HapticTarget({
  ref,
  className,
  overlayClassName,
  isTicking = true,
  keepsFocus = false,
  keepsScroll = false,
  children,
}: HapticTargetProps) {
  return (
    <span ref={ref} className={cn("group relative", className)}>
      {children}
      {isTicking && (
        <HapticTap
          className={overlayClassName}
          forwardsTap
          keepsFocus={keepsFocus}
          keepsScroll={keepsScroll}
        />
      )}
    </span>
  );
}
