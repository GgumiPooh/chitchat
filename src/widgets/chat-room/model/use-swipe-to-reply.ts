"use client";

import { GESTURE_SLOP, type Nullable, type Optional } from "@/shared/lib";
import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

// INFO: DESIGN.md § 6.10. Releasing past this fires the reply; short of it the row springs back and nothing happens.
const TRIGGER_DISTANCE = 56;

// INFO: The hard stop. Past `TRIGGER_DISTANCE` the pull is damped into the remaining gap, so the row resisting is what says the threshold has been met.
const MAX_DISTANCE = 72;
const OVERPULL_DAMPING = 0.25;

/**
 * REQUIREMENTS.md § 8.10. The touch half of reply: the row is pulled toward the
 * middle of the screen and released. A mouse never engages it — that pointer has
 * the hover-revealed control instead (AGENTS.md § 4.2.).
 *
 * `offset` is already signed for `translateX`; `isArmed` says a release now would
 * reply.
 */
export function useSwipeToReply(onReply: Optional<() => void>, isMine: boolean) {
  // INFO: Toward the screen's middle, so the pull always moves the row away from the edge it is aligned to.
  const direction = isMine ? -1 : 1;
  const gestureRef = useRef<Nullable<{ pointerId: number; x: number; y: number }>>(null);
  const isEngagedRef = useRef(false);
  const distanceRef = useRef(0);
  const hasSwipedRef = useRef(false);
  const [distance, setDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  return {
    offset: distance * direction,
    isArmed: distance >= TRIGGER_DISTANCE,
    isDragging,
    // INFO: DESIGN.md § 3.2. The hold calls this when it wins; `gestureRef` going null is what stops the same finger from re-engaging the pull behind the action sheet.
    cancel: () => handleRelease(false),
    handlers: onReply
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: () => handleRelease(true),
          // INFO: A cancel is the gesture being taken away, not let go of — it springs back without replying.
          onPointerCancel: () => handleRelease(false),
          onClickCapture: handleClickCapture,
        }
      : {},
  };

  function handlePointerDown(event: PointerEvent) {
    // WARN: Cleared here rather than only in `handleClickCapture` — a `pointercancel` is followed by no `click` at all, so a flag left standing would swallow the next genuine tap on this row.
    hasSwipedRef.current = false;

    if (!event.isPrimary || event.pointerType === "mouse") {
      return;
    }

    gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    isEngagedRef.current = false;
  }

  function handlePointerMove(event: PointerEvent) {
    const gesture = gestureRef.current;

    // INFO: A second finger landing mid-pull would otherwise be measured against the first one's origin and jump the row.
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const pulled = (event.clientX - gesture.x) * direction;

    if (!isEngagedRef.current) {
      // INFO: A gesture that leads vertically is the list scrolling, and one that leads the wrong way horizontally is not a pull; both are abandoned rather than re-tested, so a reversal cannot snap the row to an offset measured from an origin the finger left long ago.
      if (Math.abs(event.clientY - gesture.y) > Math.abs(pulled) || pulled <= -GESTURE_SLOP) {
        gestureRef.current = null;
        return;
      }

      if (pulled < GESTURE_SLOP) {
        return;
      }

      isEngagedRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
    }

    distanceRef.current = toDistance(pulled);
    setDistance(distanceRef.current);
  }

  function handleRelease(wasLetGo: boolean) {
    if (isEngagedRef.current) {
      hasSwipedRef.current = true;

      if (wasLetGo && distanceRef.current >= TRIGGER_DISTANCE) {
        onReply?.();
      }
    }

    gestureRef.current = null;
    isEngagedRef.current = false;
    distanceRef.current = 0;
    setDistance(0);
    setIsDragging(false);
  }

  // WARN: A captured pointer still ends in a `click`, so without this a pull that started on a photo opens the viewer the moment it is released.
  function handleClickCapture(event: MouseEvent) {
    if (hasSwipedRef.current) {
      hasSwipedRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }
}

// INFO: Clamped at both ends — an engaged pull dragged back past its origin would otherwise carry the row off the far side of the shell.
function toDistance(pulled: number): number {
  if (pulled <= TRIGGER_DISTANCE) {
    return Math.max(0, pulled);
  }

  return Math.min(MAX_DISTANCE, TRIGGER_DISTANCE + (pulled - TRIGGER_DISTANCE) * OVERPULL_DAMPING);
}
