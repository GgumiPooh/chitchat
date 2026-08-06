"use client";

import { cn, useIsCoarsePointer, type Maybe, type Nullable } from "@/shared/lib";
import { useEffect, useId, useRef, type MouseEvent, type PointerEvent } from "react";

// WARN: React's typings carry no `switch` attribute, and it has to be on the element from the first render — WebKit decides there whether to build the native control.
const NATIVE_SWITCH = { switch: "" } as Record<string, string>;

// INFO: DESIGN.md § 4.7.2. What `group-data-[pressed]:` reads, because `:active` is not dependable here — `keepsFocus` cancels `pointerdown`, which suppresses it outright.
const PRESSED_ATTRIBUTE = "data-pressed";

function setPressed(element: Maybe<HTMLElement>, isPressed: boolean) {
  if (isPressed) {
    element?.setAttribute(PRESSED_ATTRIBUTE, "");

    return;
  }

  element?.removeAttribute(PRESSED_ATTRIBUTE);
}

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
 * An invisible `<label>` stretched over an interactive element, wired to a native
 * WebKit switch beside it, so that tapping that element fires the system haptic
 * tick on iOS.
 *
 * Inside an `<a>`, mount it as the last child and the tap goes on reaching the
 * link's own `onClick`. Beside a `<button>`, mount it as the last child of a
 * `relative` wrapper alongside the button, and pass `forwardsTap`.
 *
 * WARN: Never *inside* a `<button>`. A label there activates the button as well
 * as the switch, so the control fires twice on one tap.
 *
 * WARN: The wrapper, not the control, is what `:active` matches once this is
 * mounted — the tap lands here. A control with `active:` styling needs `group` on
 * the wrapper and `group-active:` on itself, or it goes flat on touch
 * (`AGENTS.md § 4.2.`).
 */
// INFO: iOS exposes no Vibration API, and since 26.5 a scripted click no longer ticks either — only a real finger reaching the native control does, which is why this is an element and not a hook.
// WARN: The label takes the tap and the switch stays out of the touch path, because the switch is a native control that keeps a drag of its own (`DESIGN.md § 7.15.`). Laying the switch itself under the finger ticks too, but any surface it tiles stops scrolling.
export function HapticTap({ className, forwardsTap = false, keepsFocus = false }: HapticTapProps) {
  // INFO: AGENTS.md § 4.2. An interaction detail, not layout — a mouse gains nothing from the switch, and it would swallow the ⌘-click the covered element still owes the pointer.
  const isCoarsePointer = useIsCoarsePointer();
  const switchId = useId();
  // WARN: Captured on `pointerdown` rather than read off a ref at cleanup time — React detaches refs before a passive cleanup runs, and `useIsCoarsePointer` reports `false` on the first render, so neither the element nor its parent is reachable from the effect itself.
  const pressedParentRef = useRef<Nullable<HTMLElement>>(null);

  // WARN: The flag lives on an element this component does not own, so nothing else takes it back down. The tab bar drops `haptic` off the tab it has just switched to, which unmounts this mid-press and would otherwise leave that tab bloomed for good.
  useEffect(() => () => setPressed(pressedParentRef.current, false), []);

  if (!isCoarsePointer) {
    return null;
  }

  return (
    <>
      {/* WARN: A pixel, out of the way, but never `hidden`, `display:none` or `appearance-none` — a switch that is not rendered natively is not a native control, and a control that is not native does not tick. */}
      <input
        {...NATIVE_SWITCH}
        className="pointer-events-none absolute top-0 left-0 size-px opacity-0"
        type="checkbox"
        tabIndex={-1}
        id={switchId}
        aria-hidden
        // WARN: The label's activation toggles the switch, and that toggle's own `click` bubbles. Left alone it reaches the ancestor the forwarded tap has already fired.
        onClick={(event) => event.stopPropagation()}
      />
      {/* WARN: Never `preventDefault` this click. The label's default action *is* the toggle, and the toggle is the tick. */}
      <label
        className={cn("absolute inset-0 size-full opacity-0", className)}
        htmlFor={switchId}
        aria-hidden
        onPointerDown={handlePointerDown}
        onPointerUp={releasePress}
        onPointerCancel={releasePress}
        onPointerLeave={releasePress}
        onClick={handleClick}
      />
    </>
  );

  // WARN: The overlay takes the tap the control would have taken, so a control that cancels `pointerdown` to hold focus has to cancel it here instead — otherwise the field behind it blurs and iOS drops the keyboard.
  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (keepsFocus) {
      event.preventDefault();
    }

    pressedParentRef.current = event.currentTarget.parentElement;
    setPressed(pressedParentRef.current, true);
  }

  function releasePress() {
    setPressed(pressedParentRef.current, false);
    pressedParentRef.current = null;
  }

  // INFO: The control is reached through the DOM rather than a ref the caller passes, so a Server Component may still render it — a function prop would drag it over the client boundary.
  function handleClick(event: MouseEvent<HTMLElement>) {
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
