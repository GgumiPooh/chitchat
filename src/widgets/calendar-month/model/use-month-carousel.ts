"use client";

import { GESTURE_SLOP, shiftMonthKey, type Nullable } from "@/shared/lib";
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TransitionEvent,
} from "react";

// INFO: Far enough that a tap that drifts is not a swipe, short enough that a thumb flick across the grid clears it.
const SWIPE_THRESHOLD = 56;

type Origin = { x: number; y: number };

// INFO: DESIGN.md § 7.9. cqw reads off the nearest `container-type: inline-size` ancestor — the viewport this hook's caller wraps around the track — rather than the track's own three-times-width box, so these three numbers hold however wide the track itself renders.
const REST_CQW = -100;
const NEXT_CQW = -200;
const PREV_CQW = 0;

type Phase = "idle" | "dragging" | "next" | "prev" | "back";

/**
 * REQUIREMENTS.md § 11.3. Swipe left/right to change month, sliding rather than
 * cutting (DESIGN.md § 7.9.) — the grid follows the finger and snaps to the
 * neighbouring month over `--duration-state` on release, instead of switching
 * instantly.
 *
 * INFO: `isPaged=false` (the offline mirror, REQUIREMENTS.md § 16.2.) drops back
 * to the pre-carousel behaviour: no side grids, no track, an instant
 * `onMonthChange` past the threshold. The mirror holds one grid range of data and
 * refuses a month change with a toast, so animating toward a neighbour it cannot
 * show would draw an empty month.
 *
 * WARN: The handlers belong on an ancestor of the day cells — `onClickCapture` is
 * what stops the tap a drag ends in, and it only reaches a target it is above.
 */
export function useMonthCarousel(
  monthKey: string,
  isPaged: boolean,
  onMonthChange: (monthKey: string) => void,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragPx, setDragPx] = useState(0);
  const origin = useRef<Nullable<Origin>>(null);
  const hasDragged = useRef(false);
  const direction = useRef(1);
  const previousMonthKey = useRef(monthKey);

  // WARN: Reset in the same frame the month prop changes, or the browser paints one
  // frame of the settled track (still at -200cqw/0cqw) against the three-month array
  // `CalendarMonth` has already recomputed for the new month — a full month's jump.
  useLayoutEffect(() => {
    if (monthKey !== previousMonthKey.current) {
      previousMonthKey.current = monthKey;
      setPhase("idle");
      setDragPx(0);
    }
  }, [monthKey]);

  if (!isPaged) {
    return {
      trackStyle: undefined,
      trackClassName: "",
      onTrackTransitionEnd: undefined,
      dragHandlers: {
        onPointerDown(event: PointerEvent) {
          origin.current = { x: event.clientX, y: event.clientY };
          hasDragged.current = false;
        },
        onPointerMove(event: PointerEvent) {
          const start = origin.current;

          if (
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) >= GESTURE_SLOP
          ) {
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
            onMonthChange(shiftMonthKey(monthKey, deltaX < 0 ? 1 : -1));
          }
        },
        onPointerCancel() {
          origin.current = null;
          hasDragged.current = false;
        },
        onClickCapture(event: MouseEvent) {
          if (hasDragged.current) {
            hasDragged.current = false;
            event.stopPropagation();
            event.preventDefault();
          }
        },
      },
      goToPrev: () => onMonthChange(shiftMonthKey(monthKey, -1)),
      goToNext: () => onMonthChange(shiftMonthKey(monthKey, 1)),
    };
  }

  const targetCqw = phase === "next" ? NEXT_CQW : phase === "prev" ? PREV_CQW : REST_CQW;
  const isTransitioning = phase === "next" || phase === "prev" || phase === "back";

  return {
    trackStyle: { transform: `translateX(calc(${targetCqw}cqw + ${dragPx}px))` },
    trackClassName: isTransitioning
      ? "transition-transform duration-(--duration-state) ease-out motion-reduce:transition-none"
      : "transition-none",
    onTrackTransitionEnd(event: TransitionEvent) {
      if (event.target !== event.currentTarget || event.propertyName !== "transform") {
        return;
      }

      if (phase === "next" || phase === "prev") {
        onMonthChange(shiftMonthKey(monthKey, direction.current));
      }
    },
    dragHandlers: {
      onPointerDown(event: PointerEvent) {
        origin.current = { x: event.clientX, y: event.clientY };
        hasDragged.current = false;
      },
      // INFO: Live-tracks the finger without waiting on `SWIPE_THRESHOLD` — the release handler below is what decides whether the drag actually turns the month.
      onPointerMove(event: PointerEvent) {
        const start = origin.current;

        if (!start) {
          return;
        }

        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;

        if (!hasDragged.current) {
          if (Math.hypot(deltaX, deltaY) < GESTURE_SLOP) {
            return;
          }

          hasDragged.current = true;
        }

        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          setPhase("dragging");
          setDragPx(deltaX);
        } else if (phase === "dragging") {
          // INFO: The drag turned back toward vertical — not a swipe after all, so the track drops the offset rather than following a gesture the shell is about to scroll with.
          setPhase("idle");
          setDragPx(0);
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
          commit(deltaX < 0 ? 1 : -1);
        } else if (phase === "dragging") {
          setPhase("back");
          setDragPx(0);
        }
      },
      onPointerCancel() {
        origin.current = null;

        if (phase === "dragging") {
          setPhase("back");
          setDragPx(0);
        }

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
    },
    goToPrev: () => commit(-1),
    goToNext: () => commit(1),
  };

  function commit(nextDirection: number) {
    // INFO: DESIGN.md § 4.7. Reduced motion skips the travel entirely rather than playing it at 0s — a 0s CSS transition never fires `transitionend`, which is what would otherwise commit the month change.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onMonthChange(shiftMonthKey(monthKey, nextDirection));

      return;
    }

    direction.current = nextDirection;
    setDragPx(0);
    setPhase(nextDirection > 0 ? "next" : "prev");
  }
}
