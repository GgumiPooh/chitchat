"use client";

import { GESTURE_SLOP, type Nullable } from "@/shared/lib";
import { useRef, type MouseEvent, type PointerEvent } from "react";

// INFO: Far enough that a tap that drifts is not a swipe, short enough that a thumb flick across the grid clears it.
const SWIPE_THRESHOLD = 56;

type Origin = { x: number; y: number };

/**
 * REQUIREMENTS.md § 11.3. Swipe left/right to change month.
 *
 * WARN: Horizontal *intent* is required, not merely horizontal distance — the grid
 * sits inside the shell's vertical scroller, and a diagonal drag that happens to
 * cross the threshold would otherwise change month while the user was scrolling.
 *
 * WARN: The handlers belong on an ancestor of the day cells — `onClickCapture` is
 * what stops the tap a drag ends in, and it only reaches a target it is above.
 */
export function useMonthSwipe(onSwipe: (direction: number) => void) {
  const origin = useRef<Nullable<Origin>>(null);
  const hasDragged = useRef(false);

  return {
    onPointerDown(event: PointerEvent) {
      origin.current = { x: event.clientX, y: event.clientY };
      hasDragged.current = false;
    },
    // INFO: `GESTURE_SLOP`, not `SWIPE_THRESHOLD` — a drag too short to turn the month is still a drag, and the cell it happens to end on was never the target.
    onPointerMove(event: PointerEvent) {
      const start = origin.current;

      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= GESTURE_SLOP) {
        hasDragged.current = true;
      }
    },
    onPointerUp(event: PointerEvent) {
      const start = origin.current;

      origin.current = null;

      if (!start) {
        return;
      }

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;

      if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
        // INFO: Dragging left reveals what is ahead, as every paged surface on the platform does.
        onSwipe(deltaX < 0 ? 1 : -1);
      }
    },
    onPointerCancel() {
      origin.current = null;
      // WARN: Cleared here as well as in the click capture — a `pointercancel` is followed by no `click` at all, so a flag left standing would swallow the next genuine tap.
      hasDragged.current = false;
    },
    // WARN: A finger that drags within one cell still releases into a `click` on it. Without this, scrolling the shell from the grid selects whatever day the thumb happened to land on.
    onClickCapture(event: MouseEvent) {
      if (hasDragged.current) {
        hasDragged.current = false;
        event.stopPropagation();
        event.preventDefault();
      }
    },
  };
}
