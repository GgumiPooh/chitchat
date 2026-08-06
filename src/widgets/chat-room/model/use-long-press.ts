"use client";

import { A_SECOND, type Nullable, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { GESTURE_SLOP } from "./gesture-slop";

const LONG_PRESS_DELAY = A_SECOND / 2;

// WARN: Every element that takes the handlers below needs this. A held finger otherwise runs the browser's own long-press natives first — the selection drag over `select-text`, iOS's callout, the image drag — and the sheet opens behind a gesture the page no longer owns. A fine pointer keeps all of them, since it never arms the timer.
export const LONG_PRESS_TARGET_CLASS =
  "[-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none";

/**
 * DESIGN.md § 3.2. Touch holds the element; a mouse right-clicks it. Both open
 * the same action sheet, so the long-press affordance is never mouse-inaccessible.
 */
export function useLongPress(onLongPress: Optional<() => void>) {
  const timerRef = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);
  const startRef = useRef<Nullable<{ x: number; y: number }>>(null);

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
    startRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    // WARN: A mouse must not arm the timer — the bubble is `select-text`, so press-and-drag to select would open the sheet mid-selection. The mouse affordance is `onContextMenu`.
    onPointerDown: (event: PointerEvent) => {
      if (onLongPress && event.isPrimary && event.pointerType !== "mouse") {
        startRef.current = { x: event.clientX, y: event.clientY };
        timerRef.current = setTimeout(onLongPress, LONG_PRESS_DELAY);
      }
    },
    onPointerMove: (event: PointerEvent) => {
      const start = startRef.current;

      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= GESTURE_SLOP) {
        cancel();
      }
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    // INFO: Scrolling the list steals the pointer, which fires this — without it a swipe past a bubble would open the sheet.
    onPointerCancel: cancel,
    onContextMenu: (event: MouseEvent) => {
      if (!onLongPress) {
        return;
      }

      event.preventDefault();
      cancel();
      onLongPress();
    },
  };
}
