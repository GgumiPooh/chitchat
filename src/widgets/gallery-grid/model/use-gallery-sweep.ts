"use client";

import { APP_SCROLL_ID } from "@/shared/config";
import { GESTURE_SLOP, type LongPressPoint, type Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef } from "react";

/** REQUIREMENTS.md § 10. The sweep hit-tests the document rather than hearing an event per tile, so the id has to be readable off the DOM. */
export const GALLERY_TILE_ID_ATTRIBUTE = "data-gallery-tile-id";

// INFO: How close to the scroller's edge the finger has to come before the grid starts moving under it, and the per-frame travel at the very edge.
const EDGE_ZONE = 96;
const MAX_SCROLL_STEP = 18;

function travel(depth: number) {
  return (Math.min(depth, EDGE_ZONE) / EDGE_ZONE) * MAX_SCROLL_STEP;
}

export type GallerySweepHandlers = {
  /** The tile the finger is over now; the range between it and the held one is the caller's to fill. */
  onEnter: (id: string) => void;
  /** The finger that was sweeping has left the glass. */
  onEnd: () => void;
};

/**
 * REQUIREMENTS.md § 10. The drag that follows a hold. The grid scrolls itself
 * while the finger rests near an edge, so one sweep can outrun the screen.
 *
 * WARN: Touch events, not pointer events. The gesture is touch-only — a mouse
 * never arms the hold (`DESIGN.md § 3.2.`) — and only a non-passive `touchmove`
 * can call `preventDefault`, which is the one thing keeping the drag from
 * scrolling the page instead. `touch-action` cannot do it: the finger is already
 * down when the sweep arms, and that property is read when the gesture begins.
 */
export function useGallerySweep({ onEnter, onEnd }: GallerySweepHandlers) {
  // WARN: Read through a ref. The listeners attach once for the whole gesture, and re-attaching them on a new `onEnter` — which every tile the sweep reaches produces — would drop the tracked finger and the auto-scroll with it.
  const handlersRef = useRef({ onEnter, onEnd });
  const stopRef = useRef<Nullable<() => void>>(null);

  useEffect(() => {
    handlersRef.current = { onEnter, onEnd };
  });

  useEffect(() => () => stopRef.current?.(), []);

  /**
   * WARN: Listeners are attached here, inside the hold that fires it, and never
   * from an effect. An effect runs a frame later, and a finger that lifts inside
   * that window is a `touchend` nothing is listening for — leaving a document-wide
   * non-passive `touchmove` that `preventDefault`s every later scroll, with a live
   * anchor still selecting behind it.
   */
  return useCallback((anchor: LongPressPoint) => {
    stopRef.current?.();

    let point: Nullable<LongPressPoint> = null;
    let touchId: Nullable<number> = null;
    let lastId: Nullable<string> = null;
    let frame = requestAnimationFrame(step);

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    stopRef.current = () => {
      stopRef.current = null;
      cancelAnimationFrame(frame);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      handlersRef.current.onEnd();
    };

    function distanceToAnchor(touch: Touch) {
      return Math.hypot(touch.clientX - anchor.x, touch.clientY - anchor.y);
    }

    // INFO: The sweeping finger is the one nearest where the hold fired, which is not `touches[0]` — a thumb resting on the grid since before it landed comes first in that list.
    function trackTouch(touches: TouchList) {
      const list = Array.from(touches);

      if (touchId !== null) {
        return list.find((touch) => touch.identifier === touchId);
      }

      return list.sort((a, b) => distanceToAnchor(a) - distanceToAnchor(b))[0];
    }

    function handleTouchMove(event: TouchEvent) {
      const touch = trackTouch(event.touches);

      if (!touch) {
        return;
      }

      touchId = touch.identifier;
      event.preventDefault();
      point = { x: touch.clientX, y: touch.clientY };
      enterAt(point);
    }

    // WARN: Only the sweeping finger ends the sweep. A second finger lifting would otherwise stop it mid-drag, and with it the `preventDefault` — so the grid would start scrolling under a finger the user is still selecting with.
    function handleTouchEnd(event: TouchEvent) {
      const released = Array.from(event.changedTouches);
      const isSweeper =
        touchId === null
          ? // INFO: Before the first move there is no identifier to match, but there is nowhere else the finger can be: any drift past `GESTURE_SLOP` would have cancelled the hold rather than fired it.
            released.some((touch) => distanceToAnchor(touch) < GESTURE_SLOP)
          : released.some((touch) => touch.identifier === touchId);

      if (isSweeper) {
        stopRef.current?.();
      }
    }

    function enterAt({ x, y }: LongPressPoint) {
      // WARN: `elementsFromPoint`, not `elementFromPoint`. The selection bar floats over most of the bottom edge zone and takes pointer events, so the topmost element there is the bar and the tile under it would never be reached.
      const tile = document
        .elementsFromPoint(x, y)
        .map((element) => element.closest(`[${GALLERY_TILE_ID_ATTRIBUTE}]`))
        .find((element) => element !== null);
      const id = tile?.getAttribute(GALLERY_TILE_ID_ATTRIBUTE);

      // INFO: The range the caller fills stays the same for as long as the finger is over one tile, so the gap between two of them is not worth reporting either.
      if (!id || id === lastId) {
        return;
      }

      lastId = id;
      handlersRef.current.onEnter(id);
    }

    function step() {
      frame = requestAnimationFrame(step);

      const scroller = document.getElementById(APP_SCROLL_ID);

      if (!scroller || !point) {
        return;
      }

      const { top, bottom } = scroller.getBoundingClientRect();
      const intoTop = top + EDGE_ZONE - point.y;
      const intoBottom = point.y - bottom + EDGE_ZONE;
      const before = scroller.scrollTop;

      if (intoTop > 0) {
        scroller.scrollTop -= travel(intoTop);
      } else if (intoBottom > 0) {
        scroller.scrollTop += travel(intoBottom);
      }

      // WARN: Re-tested every frame the grid actually moved, not only on `touchmove`. A finger parked at the edge sends no move at all, and there the tiles are what travels.
      if (scroller.scrollTop !== before) {
        enterAt(point);
      }
    }
  }, []);
}
