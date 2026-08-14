"use client";

import { useCallback, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { GESTURE_SLOP } from "../input/gesture";
import type { Nullable } from "../nullish";

/** How far the content has to travel before a lift dismisses instead of springing back. */
const DISMISS_DISTANCE = 110;

/** INFO: px per ms. A flick leaves before it has travelled `DISMISS_DISTANCE`, so a quick throw does not have to cross half the screen. */
const DISMISS_VELOCITY = 0.5;

// INFO: How much of an upward drag survives. The gesture is downward, and a bound that simply refused to move read as the surface having frozen.
const UPWARD_RUBBER_BAND = 0.2;

/** INFO: The scrim is never taken all the way out under the finger — a photo peeked at and released has to stay readable against something the whole way. */
const MAX_SCRIM_FADE = 0.6;

// INFO: How far the content shrinks at the dismiss point, which is what says the surface is leaving rather than scrolling.
const MAX_SHRINK = 0.12;

/**
 * INFO: How far the horizontal has to outrun the vertical before the gesture is given
 * up as a swipe rather than a pull — roughly 34° off horizontal.
 *
 * WARN: The abandon used to be `|dx| >= |dy|`, which hands every diagonal to the swipe and every tie with it. A thumb pulling down arcs, so the first few pixels of an honest downward drag are routinely sideways: those readers got the surface refusing to move, and the refusal is permanent within a gesture — the origin is dropped, so the same finger travelling straight down for the next 200px still did nothing. The bias leaves a wedge either side of the diagonal where neither axis has won yet, and the gesture simply keeps waiting for one to.
 */
const AXIS_BIAS = 1.5;

export type SwipeDismissOptions = {
  /** Off wherever another gesture owns the finger — a zoomed slide's pan (REQUIREMENTS.md § 18. #6.). */
  isEnabled: boolean;
  /**
   * A veto the caller owns, for a target this hook cannot recognise on its own.
   *
   * INFO: The § 7.10. viewer's player is the case: a `<video>` spans the whole slide at the stored ratio, so only its **painted** rectangle may keep the gesture — the letterboxed remainder is the slide, and pulling on it has to close the viewer like anywhere else.
   */
  canStart?: (event: PointerEvent<HTMLElement>) => boolean;
  onDismiss: () => void;
};

/**
 * DESIGN.md § 7.10. Pull an overlay down to close it, the way iOS's own photo viewer
 * does — the content follows the finger, the scrim thins with it, and a lift past
 * either the distance or the velocity threshold dismisses.
 *
 * WARN: Touch and pen only. On a mouse a downward drag over a horizontal scroller is
 * how a desktop reader drags the track itself, and the pointer there already has 닫기
 * and `Escape`.
 * WARN: The direction is decided once, on the first movement past `GESTURE_SLOP`, and
 * a horizontal one abandons the gesture for good — otherwise a swipe between slides
 * that drifts a few pixels down starts dragging the overlay out from under it.
 *
 * WARN: **One pointer, latched by id, and a second one abandons the gesture outright.**
 * The surface this is attached to is an ancestor of the one `usePinchZoom` takes, so at
 * rest — where `isEnabled` is still true, since scale is 1 — both fingers of a pinch
 * arrive here. Unlatched, the second `pointerdown` overwrote the origin and the first
 * finger's next move measured against it, which is a `dy` of hundreds of pixels: the
 * track jumped, `setPointerCapture` retargeted that finger away from the slide so the
 * pinch froze, and the lift closed the viewer.
 */
export function useSwipeDismiss({ isEnabled, canStart, onDismiss }: SwipeDismissOptions) {
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const originRef = useRef<Nullable<{ x: number; y: number; at: number }>>(null);
  // WARN: The one pointer this gesture belongs to. Every handler below is filtered on it — see the hook's own WARN for what a second finger did without it.
  const pointerIdRef = useRef<Nullable<number>>(null);
  // WARN: A drag ends in a `click`, and the surface it ends on toggles the viewer's chrome. This is what tells the caller to drop that one.
  const hasDraggedRef = useRef(false);
  const progress = Math.min(Math.abs(offset) / DISMISS_DISTANCE, 1);

  // INFO: Read and cleared together, so a caller cannot leave a stale suppression to swallow the next real tap.
  const consumeClick = useCallback(() => {
    const hasDragged = hasDraggedRef.current;

    hasDraggedRef.current = false;

    return hasDragged;
  }, []);

  return {
    isDragging,
    consumeClick,
    /** The moving surface — translated with the finger and shrunk as it goes. */
    contentStyle: {
      transform: `translate3d(0, ${offset}px, 0) scale(${1 - progress * MAX_SHRINK})`,
      // INFO: A settled offset eases back; a moving one must not, or the surface lags the finger by a whole transition.
      transition: isDragging ? undefined : "transform var(--duration-state) var(--ease-press)",
    } satisfies CSSProperties,
    /** The scrim behind it, thinning as the surface leaves. */
    scrimStyle: {
      opacity: 1 - progress * MAX_SCRIM_FADE,
      transition: isDragging ? undefined : "opacity var(--duration-state) var(--ease-press)",
    } satisfies CSSProperties,
    surfaceProps: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        // WARN: A second finger is a pinch starting, so the drag is abandoned and its capture released — held, it keeps that pointer away from the element `usePinchZoom` counts on.
        if (pointerIdRef.current !== null) {
          abandon(event);

          return;
        }

        // WARN: The controls a slide carries are excluded whole — a `<video>`'s transport is dragged horizontally and vertically alike, and its scrub must not pull the viewer off screen. What of a player is a control at all is the caller's to answer, through `canStart`.
        if (
          !isEnabled ||
          event.pointerType === "mouse" ||
          (event.target as HTMLElement).closest("a, button") ||
          canStart?.(event) === false
        ) {
          return;
        }

        pointerIdRef.current = event.pointerId;
        originRef.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
      },

      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const origin = originRef.current;

        if (!origin || event.pointerId !== pointerIdRef.current) {
          return;
        }

        // WARN: Re-read on every move, never only at `pointerdown`. A pinch that reaches scale 1.01 mid-drag flips it, and a drag that carried on from there would fight the pan for the same finger.
        if (!isEnabled) {
          abandon(event);

          return;
        }

        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;

        if (!isDragging) {
          // WARN: Only a horizontal that has clearly won gives the gesture up — see `AXIS_BIAS`. Anything inside the wedge falls through to the vertical test below and, failing that, waits for the next move rather than settling on an axis the finger has not chosen yet.
          if (Math.abs(dx) > GESTURE_SLOP && Math.abs(dx) > Math.abs(dy) * AXIS_BIAS) {
            originRef.current = null;

            return;
          }

          if (Math.abs(dy) <= GESTURE_SLOP || Math.abs(dy) < Math.abs(dx)) {
            return;
          }

          setIsDragging(true);
          hasDraggedRef.current = true;
          // WARN: Captured once the direction is settled, never at `pointerdown` — capturing earlier would take the horizontal swipe the track is built on.
          event.currentTarget.setPointerCapture(event.pointerId);
        }

        setOffset(dy < 0 ? dy * UPWARD_RUBBER_BAND : dy);
      },

      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const origin = originRef.current;

        if (event.pointerId !== pointerIdRef.current) {
          return;
        }

        pointerIdRef.current = null;
        originRef.current = null;

        if (!origin || !isDragging) {
          return;
        }

        setIsDragging(false);

        const dy = event.clientY - origin.y;
        const elapsed = Math.max(event.timeStamp - origin.at, 1);

        if (dy > DISMISS_DISTANCE || dy / elapsed > DISMISS_VELOCITY) {
          onDismiss();

          return;
        }

        setOffset(0);
      },

      // WARN: A cancel is not a lift. The gesture is abandoned wherever it stands and the surface springs back — dismissing on one would close the viewer for a phone call arriving mid-drag.
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        if (event.pointerId === pointerIdRef.current) {
          abandon(event);
        }
      },
    },
  };

  /**
   * Drops the gesture where it stands and springs the surface back.
   *
   * WARN: `hasDraggedRef` is cleared here too, and it is the whole reason this is one function. A cancel produces no `click`, so a suppression left standing is spent on the reader's **next** real tap — the chrome toggle silently doing nothing once, after exactly the interruption this branch exists for.
   */
  function abandon(event: PointerEvent<HTMLElement>) {
    if (
      pointerIdRef.current !== null &&
      event.currentTarget.hasPointerCapture(pointerIdRef.current)
    ) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current);
    }

    pointerIdRef.current = null;
    originRef.current = null;
    hasDraggedRef.current = false;
    setIsDragging(false);
    setOffset(0);
  }
}
