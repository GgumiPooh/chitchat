"use client";

import { useRef, type DragEvent, type MouseEvent, type PointerEvent } from "react";
import type { Nullable } from "../nullish";

// INFO: Below this a press that wanders by a pixel is still a tap, so a thumbnail is not lost to a hand that moves on the button.
const DRAG_THRESHOLD = 4;

/**
 * AGENTS.md § 4.2. Lets a **mouse** drag a horizontal scroller the way a finger
 * already can — the pointer half of DESIGN.md § 7.10.'s filmstrip.
 *
 * WARN: Touch and pen are left to the platform. A finger already pans a native
 * scroller, with momentum and rubber-banding this cannot reproduce, and taking the
 * gesture would replace all of that with a linear follow.
 * WARN: The pointer is captured only once the drag has passed `DRAG_THRESHOLD`, never on the press. Capturing at `pointerdown` retargets the events the browser derives a `click` from, so every tap on a child would be delivered to the scroller instead.
 * WARN: `onDragStart` is part of the answer rather than styling. A mouse press on an `<img>` starts a native drag, which cancels the pointer stream mid-scroll and leaves a ghost of the thumbnail under the cursor.
 */
export function useDragScroll() {
  const originRef = useRef<Nullable<{ x: number; scrollLeft: number }>>(null);
  const hasDraggedRef = useRef(false);

  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      hasDraggedRef.current = false;

      if (event.pointerType !== "mouse" || event.button !== 0) {
        return;
      }

      originRef.current = { x: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const origin = originRef.current;

      if (!origin) {
        return;
      }

      // WARN: A press that never passed the threshold takes no pointer capture, so one released off the element reports neither `pointerup` nor `pointercancel` here — and the armed origin would then turn the next **hover** into a scroll under a button nobody is holding.
      if (event.buttons === 0) {
        release(event);

        return;
      }

      const travelled = event.clientX - origin.x;

      if (!hasDraggedRef.current) {
        if (Math.abs(travelled) < DRAG_THRESHOLD) {
          return;
        }

        hasDraggedRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      event.currentTarget.scrollLeft = origin.scrollLeft - travelled;
    },
    onPointerUp: release,
    onPointerCancel: release,
    onDragStart(event: DragEvent<HTMLElement>) {
      event.preventDefault();
    },
    // WARN: Capture phase, and it is what keeps a drag that ends over a child from activating it — a `click` is dispatched at their common ancestor, which is this scroller, so a bubble-phase handler would run after the child's own.
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (!hasDraggedRef.current) {
        return;
      }

      hasDraggedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  function release(event: PointerEvent<HTMLElement>) {
    originRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }
}
