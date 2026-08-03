"use client";

import { A_SECOND, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

const LONG_PRESS_DELAY = A_SECOND / 2;

/**
 * DESIGN.md § 3.2. Touch holds the element; a mouse right-clicks it. Both open
 * the same action sheet, so the long-press affordance is never mouse-inaccessible.
 */
export function useLongPress(onLongPress: Optional<() => void>) {
  const timerRef = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);

  const cancel = useCallback(() => clearTimeout(timerRef.current), []);

  useEffect(() => cancel, [cancel]);

  return {
    // WARN: A mouse must not arm the timer — the bubble is `select-text`, so press-and-drag to select would open the sheet mid-selection. The mouse affordance is `onContextMenu`.
    onPointerDown: (event: PointerEvent) => {
      if (onLongPress && event.isPrimary && event.pointerType !== "mouse") {
        timerRef.current = setTimeout(onLongPress, LONG_PRESS_DELAY);
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
