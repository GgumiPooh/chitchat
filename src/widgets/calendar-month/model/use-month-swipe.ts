"use client";

import type { Nullable } from "@/shared/lib";
import { useRef, type PointerEvent } from "react";

// INFO: Far enough that a tap that drifts is not a swipe, short enough that a thumb flick across the grid clears it.
const SWIPE_THRESHOLD = 56;

type Origin = { x: number; y: number };

/**
 * REQUIREMENTS.md § 11.3. Swipe left/right to change month.
 *
 * WARN: Horizontal *intent* is required, not merely horizontal distance — the grid
 * sits inside the shell's vertical scroller, and a diagonal drag that happens to
 * cross the threshold would otherwise change month while the user was scrolling.
 */
export function useMonthSwipe(onSwipe: (direction: number) => void) {
  const origin = useRef<Nullable<Origin>>(null);

  return {
    onPointerDown(event: PointerEvent) {
      origin.current = { x: event.clientX, y: event.clientY };
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
    },
  };
}
