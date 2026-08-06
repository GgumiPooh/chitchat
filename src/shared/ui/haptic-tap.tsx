"use client";

import { GESTURE_SLOP, cn, useIsCoarsePointer, type Maybe, type Nullable } from "@/shared/lib";
import { useEffect, useId, useRef, type MouseEvent, type PointerEvent } from "react";

// WARN: React's typings carry no `switch` attribute, and it has to be on the element from the first render — WebKit decides there whether to build the native control.
const NATIVE_SWITCH = { switch: "" } as Record<string, string>;

// INFO: DESIGN.md § 4.7.2. What `group-data-[pressed]:` reads, because `:active` cannot reach the wrapper from here — WebKit resolves the press inside the native switch, and `keepsFocus` cancels `pointerdown`, which suppresses `:active` outright.
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
  /**
   * Takes the tap on a `<label>` and leaves the switch itself out of the way, for
   * an overlay on a cell that tiles a scroller. See `DESIGN.md § 7.15.1.`
   *
   * WARN: Never inside an `<a>`. The anchor's own activation takes the click, so
   * the label's never runs and nothing toggles — which is a tick that goes
   * missing in silence, not a build error.
   */
  keepsScroll?: boolean;
};

/**
 * An invisible WebKit switch stretched over an interactive element, so that
 * tapping that element fires the system haptic tick on iOS.
 *
 * Inside an `<a>`, mount it as the last child and the tap goes on reaching the
 * link's own `onClick`. Beside a `<button>`, mount it as the last child of a
 * `relative` wrapper alongside the button, and pass `forwardsTap`.
 *
 * A release that travelled `GESTURE_SLOP` or more is a drag, and a drag reaches
 * neither the control nor the Taptic engine (`DESIGN.md § 7.15.2.`). Every host
 * gets that; there is nothing to opt into.
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
export function HapticTap({
  className,
  forwardsTap = false,
  keepsFocus = false,
  keepsScroll = false,
}: HapticTapProps) {
  // INFO: AGENTS.md § 4.2. An interaction detail, not layout — a mouse gains nothing from the switch, and it would swallow the ⌘-click the covered element still owes the pointer.
  const isCoarsePointer = useIsCoarsePointer();
  const switchId = useId();
  // WARN: Captured on `pointerdown` rather than read off a ref at cleanup time — React detaches refs before a passive cleanup runs, and `useIsCoarsePointer` reports `false` on the first render, so neither the element nor its parent is reachable from the effect itself.
  const pressedParentRef = useRef<Nullable<HTMLElement>>(null);
  const pressOriginRef = useRef<Nullable<{ x: number; y: number }>>(null);
  const hasDraggedRef = useRef(false);

  // WARN: The flag lives on an element this component does not own, so nothing else takes it back down. The tab bar drops `haptic` off the tab it has just switched to, which unmounts this mid-press and would otherwise leave that tab bloomed for good.
  useEffect(() => () => setPressed(pressedParentRef.current, false), []);

  if (!isCoarsePointer) {
    return null;
  }

  const overlayProps = {
    className: cn("absolute inset-0 size-full opacity-0", className),
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: releasePress,
    onPointerCancel: cancelPress,
    onPointerLeave: releasePress,
    onClick: handleClick,
  };

  if (!keepsScroll) {
    return (
      <input
        {...NATIVE_SWITCH}
        {...overlayProps}
        // WARN: The switch must keep its native rendering — `appearance-none` or any restyle drops the haptic, so it is hidden with opacity alone.
        type="checkbox"
        tabIndex={-1}
        aria-hidden
      />
    );
  }

  return (
    <>
      {/* WARN: A pixel, out of the way, but never `hidden` or `display:none` — a switch that is not rendered is not a native control, and a control that is not native does not tick. */}
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
      {/* WARN: A `<label>` and not the switch, so the drag stays with the scroller — the switch is a native control and keeps a drag of its own (`DESIGN.md § 7.15.`). */}
      {/* WARN: Never `preventDefault` this click except on the drag branch below. The label's default action *is* the toggle, and the toggle is the tick. */}
      <label {...overlayProps} htmlFor={switchId} aria-hidden />
    </>
  );

  // WARN: The overlay takes the tap the control would have taken, so a control that cancels `pointerdown` to hold focus has to cancel it here instead — otherwise the field behind it blurs and iOS drops the keyboard.
  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (keepsFocus) {
      event.preventDefault();
    }

    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    hasDraggedRef.current = false;
    pressedParentRef.current = event.currentTarget.parentElement;
    setPressed(pressedParentRef.current, true);
  }

  // INFO: `GESTURE_SLOP`, the same distance every other gesture in the app disarms at (`shared/lib/gesture.ts`) — a tap that drifts a few pixels is still a tap.
  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const origin = pressOriginRef.current;

    if (!origin || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < GESTURE_SLOP) {
      return;
    }

    hasDraggedRef.current = true;
    // INFO: A finger that has started travelling is no longer pressing this, and the bloom would otherwise sit under it for the length of the scroll.
    setPressed(pressedParentRef.current, false);
  }

  function releasePress() {
    setPressed(pressedParentRef.current, false);
    pressedParentRef.current = null;
    pressOriginRef.current = null;
  }

  // WARN: The flag is cleared here as well as on the click — a `pointercancel` is followed by no `click` at all, so one left standing would swallow the next genuine tap.
  function cancelPress() {
    releasePress();
    hasDraggedRef.current = false;
  }

  // INFO: The control is reached through the DOM rather than a ref the caller passes, so a Server Component may still render it — a function prop would drag it over the client boundary.
  function handleClick(event: MouseEvent<HTMLElement>) {
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      // WARN: `preventDefault` is what silences the tick — the overlay's default action is the toggle, and the toggle is the only thing that ticks (`DESIGN.md § 7.15.2.`).
      event.preventDefault();
      // WARN: And `stopPropagation` is what stops the navigation, for the one host whose click reaches an ancestor rather than a sibling — inside an `<a>` there is nothing else standing between the drag and the route change.
      event.stopPropagation();

      return;
    }

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
