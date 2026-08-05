"use client";

import { A_SECOND, type Nullable } from "@/shared/lib";
import { useRef, type MouseEvent, type PointerEvent } from "react";

// INFO: Long enough that the drift of a vertical flick never reads as a swipe, short enough to complete inside one thumb travel.
const SWIPE_DISTANCE = 48;

// WARN: A window rather than a flag held until the next tap — the browser suppresses the `click` after a gesture the scroller also acted on, and a flag left standing would then swallow the next keyboard or assistive activation instead, which arrives with no `pointerdown` to clear it.
const TAP_SUPPRESSION_WINDOW = A_SECOND / 4;

/** `1` moves to the next item, `-1` to the previous one. */
export type SwipeDirection = 1 | -1;

/**
 * A horizontal drag over a surface that scrolls vertically: the axis with the
 * larger travel wins, so the scroll is never stolen from a mostly-vertical
 * gesture.
 */
export function useHorizontalSwipe(onSwipe: (direction: SwipeDirection) => void) {
  const origin = useRef<Nullable<{ pointerId: number; x: number; y: number }>>(null);
  const swipedAt = useRef(0);

  return {
    onPointerDown: begin,
    onPointerUp: end,
    onPointerCancel: abort,
    onClickCapture: swallowTapAfterSwipe,
  };

  // WARN: The first pointer down owns the gesture. Overwriting it on a second finger would measure the distance *between* two fingers, which a two-finger rest on the grid turns into a swipe nobody made.
  function begin(event: PointerEvent) {
    swipedAt.current = 0;

    if (!origin.current) {
      origin.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }

  function abort(event: PointerEvent) {
    if (origin.current?.pointerId === event.pointerId) {
      origin.current = null;
    }
  }

  function end(event: PointerEvent) {
    const from = origin.current;

    if (!from || from.pointerId !== event.pointerId) {
      return;
    }

    origin.current = null;

    const travelX = event.clientX - from.x;
    const travelY = event.clientY - from.y;

    if (Math.abs(travelX) < SWIPE_DISTANCE || Math.abs(travelX) <= Math.abs(travelY)) {
      return;
    }

    swipedAt.current = event.timeStamp;
    onSwipe(travelX < 0 ? 1 : -1);
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
