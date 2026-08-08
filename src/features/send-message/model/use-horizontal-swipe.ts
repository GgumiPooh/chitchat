"use client";

import { A_SECOND, type Nullable } from "@/shared/lib";
import { useRef, type MouseEvent, type PointerEvent } from "react";

// INFO: Long enough that the drift of a vertical flick never reads as a swipe, short enough to complete inside one thumb travel.
const SWIPE_DISTANCE = 48;

// INFO: A flick is short and fast, so it never reaches `SWIPE_DISTANCE` before the finger leaves — it is judged on how quickly the travel arrived instead.
const FLICK_DISTANCE = 24;
const FLICK_DURATION = A_SECOND / 4;

// INFO: The axis is locked once the gesture is this far from its origin, so the arc a thumb actually draws cannot flip it back mid-swipe.
const AXIS_LOCK_DISTANCE = 10;

// WARN: A window rather than a flag held until the next tap — the browser suppresses the `click` after a gesture the scroller also acted on, and a flag left standing would then swallow the next keyboard or assistive activation instead, which arrives with no `pointerdown` to clear it.
const TAP_SUPPRESSION_WINDOW = A_SECOND / 4;

type Axis = "horizontal" | "vertical";

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  startedAt: number;
  axis: Nullable<Axis>;
  hasSwiped: boolean;
};

/** `1` moves to the next item, `-1` to the previous one. */
export type SwipeDirection = 1 | -1;

/**
 * A horizontal drag over a surface that scrolls vertically: the axis with the
 * larger travel wins at the moment the gesture commits to one, so the scroll is
 * never stolen from a mostly-vertical gesture and a curved horizontal one is
 * never handed back to it.
 */
export function useHorizontalSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const gesture = useRef<Nullable<Gesture>>(null);
  const swipedAt = useRef(0);

  return {
    onPointerDown: begin,
    onPointerMove: track,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: abandon,
    onClickCapture: swallowTapAfterSwipe,
  };

  /**
   * WARN: A second finger must not take the gesture over — measuring from its
   * origin turns a two-finger rest on the grid into a swipe nobody made — but the
   * test for that is `isPrimary`, **never** "a gesture is already standing".
   *
   * A gesture only ends on a release this element sees, and there are ways for that
   * release never to arrive: the § 13.6. panel going `inert` under a finger, or an
   * ancestor taking pointer capture mid-press. Refusing every later `pointerdown`
   * on the strength of that leftover is how the swipe stops working for the rest of
   * the session — the picker never unmounts, so nothing clears it.
   */
  function begin(event: PointerEvent) {
    swipedAt.current = 0;

    if (!event.isPrimary) {
      return;
    }

    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: event.timeStamp,
      axis: null,
      hasSwiped: false,
    };
  }

  // WARN: The swipe fires here rather than on `pointerup`, because a finger that also moved the scroller gets a `pointercancel` instead and the release is never measured.
  function track(event: PointerEvent) {
    const from = gesture.current;

    if (!from || from.pointerId !== event.pointerId || from.hasSwiped) {
      return;
    }

    const travelX = event.clientX - from.x;
    const travelY = event.clientY - from.y;

    if (!from.axis) {
      if (Math.hypot(travelX, travelY) < AXIS_LOCK_DISTANCE) {
        return;
      }

      from.axis = Math.abs(travelX) > Math.abs(travelY) ? "horizontal" : "vertical";

      // WARN: Capture is taken here and never on `pointerdown`. A captured pointer delivers its `click` to the capturing element, so capturing every press means no emoticon cell is ever clickable — only a gesture already committed to the horizontal axis, whose `click` is meant to be swallowed anyway, can afford it.
      if (from.axis === "horizontal") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    }

    if (from.axis === "vertical") {
      gesture.current = null;

      return;
    }

    if (!isSwipe(travelX, event.timeStamp - from.startedAt)) {
      return;
    }

    from.hasSwiped = true;
    swipedAt.current = event.timeStamp;
    onSwipe(travelX < 0 ? 1 : -1);
  }

  function end(event: PointerEvent) {
    const from = gesture.current;

    if (!from || from.pointerId !== event.pointerId) {
      return;
    }

    gesture.current = null;

    // INFO: The suppression window (§ `TAP_SUPPRESSION_WINDOW`) is measured from the release, since a finger can rest for as long as it likes after the swipe already fired.
    if (from.hasSwiped) {
      swipedAt.current = event.timeStamp;
    }
  }

  // WARN: What capture used to cover. A press released outside the panel delivers no `pointerup`, and the stale gesture would then block every later one — a gesture already on the horizontal axis holds capture and so is never abandoned here.
  function abandon(event: PointerEvent) {
    if (gesture.current?.pointerId === event.pointerId && gesture.current.axis !== "horizontal") {
      gesture.current = null;
    }
  }

  function isSwipe(travelX: number, elapsed: number) {
    const distance = Math.abs(travelX);

    return distance >= SWIPE_DISTANCE || (distance >= FLICK_DISTANCE && elapsed <= FLICK_DURATION);
  }

  // WARN: The browser still fires `click` on whatever a horizontal drag started on, so without this a swipe begun on a cell also picks that cell.
  function swallowTapAfterSwipe(event: MouseEvent) {
    if (event.timeStamp - swipedAt.current > TAP_SUPPRESSION_WINDOW) {
      return;
    }

    swipedAt.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }
}
