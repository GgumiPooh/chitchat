"use client";

import { cn, useIsCoarsePointer } from "@/shared/lib";
import type { MouseEvent, PointerEvent } from "react";

// WARN: React's typings carry no `switch` attribute, and it has to be on the element from the first render — WebKit decides there whether to build the native control.
const NATIVE_SWITCH = { switch: "" } as Record<string, string>;

// WARN: Not `previousElementSibling`. Radix's `Switch` renders a hidden bubble input after its `<button>` inside a form, and that input is what a positional lookup would find and click.
const CONTROL_SELECTOR = "button, a";

export type HapticTapProps = {
  className?: string;
  /** Clicks the control this overlay covers. Required beside a `<button>`, which never sees the tap itself. */
  forwardsTap?: boolean;
  /** Keeps the tap from moving focus, for a control whose own `pointerdown` handler does the same. */
  keepsFocus?: boolean;
};

/**
 * An invisible WebKit switch stretched over an interactive element, so that
 * tapping that element fires the system haptic tick on iOS.
 *
 * Inside an `<a>`, mount it as the last child and the tap goes on reaching the
 * link's own `onClick`. Beside a `<button>`, mount it as the last child of a
 * `relative` wrapper alongside the button, and pass `forwardsTap`.
 *
 * WARN: Never *inside* a `<button>`. WebKit ends the tap in the native control
 * there and no click reaches JS at all — not the button's handler, and not this
 * element's own — so there is nothing left to forward with.
 *
 * WARN: The wrapper, not the control, is what `:active` matches once this is
 * mounted — the tap lands here. A control with `active:` styling needs `group` on
 * the wrapper and `group-active:` on itself, or it goes flat on touch
 * (`AGENTS.md § 4.2.`).
 */
// INFO: iOS exposes no Vibration API, and since 26.5 a scripted click on the switch no longer ticks either — only a real finger landing on the native control does, which is why this is an element and not a hook.
export function HapticTap({ className, forwardsTap = false, keepsFocus = false }: HapticTapProps) {
  // INFO: AGENTS.md § 4.2. An interaction detail, not layout — a mouse gains nothing from the switch, and it would swallow the ⌘-click the covered element still owes the pointer.
  const isCoarsePointer = useIsCoarsePointer();

  if (!isCoarsePointer) {
    return null;
  }

  return (
    <input
      {...NATIVE_SWITCH}
      // WARN: The switch must keep its native rendering — `appearance-none` or any restyle drops the haptic, so it is hidden with opacity alone.
      className={cn("absolute inset-0 size-full opacity-0", className)}
      type="checkbox"
      tabIndex={-1}
      aria-hidden
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    />
  );

  // WARN: The overlay takes the tap the control would have taken, so a control that cancels `pointerdown` to hold focus has to cancel it here instead — otherwise the field behind it blurs and iOS drops the keyboard.
  function handlePointerDown(event: PointerEvent<HTMLInputElement>) {
    if (keepsFocus) {
      event.preventDefault();
    }
  }

  // INFO: The control is reached through the DOM rather than a ref the caller passes, so a Server Component may still render it — a function prop would drag it over the client boundary.
  function handleClick(event: MouseEvent<HTMLInputElement>) {
    if (!forwardsTap) {
      return;
    }

    // WARN: Stopped before it is replayed. The forwarded click bubbles on its own, so letting this one through as well would fire an ancestor's handler twice.
    event.stopPropagation();

    const control = Array.from(event.currentTarget.parentElement?.children ?? []).find(
      (child) => child !== event.currentTarget && child.matches(CONTROL_SELECTOR),
    );

    if (control instanceof HTMLElement) {
      control.click();
    }
  }
}
