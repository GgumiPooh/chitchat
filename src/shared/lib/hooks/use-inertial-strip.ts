"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { A_SECOND } from "../date/time";
import { GESTURE_SLOP } from "../input/gesture";
import type { Nullable } from "../nullish";
import { useIsomorphicLayoutEffect } from "./use-isomorphic-layout-effect";

// INFO: How far a release's speed is projected before the decay is applied — the distance a flick carries, expressed as milliseconds of travel at the speed it left the finger.
const THROW_PROJECTION = A_SECOND / 8;

// INFO: The decay's time constant: the row covers `1 - 1/e` of whatever is left every one of these.
const DECAY_TIME_CONSTANT = A_SECOND / 8;

// INFO: The window a release's speed is measured over. Shorter reads the jitter of the last frame; longer reads the middle of the drag rather than its end.
const VELOCITY_WINDOW = A_SECOND / 20;

// INFO: Below this there is nothing left to paint, so the row lands on its target outright.
const SETTLE_EPSILON = 0.5;

// INFO: How much of a drag past either end survives as movement, so the bound is felt rather than hit — the same treatment `usePinchZoom` gives the scale.
const RUBBER_BAND_FACTOR = 0.3;

type Sample = { x: number; at: number };

type Drag = {
  pointerId: number;
  origin: number;
  offsetAtStart: number;
  samples: Sample[];
  hasTravelled: boolean;
};

/**
 * WARN: `isCommanded` marks a glide this component was *told* to make, and it is what
 * keeps the notch from being reported on the way through. A commanded move crosses
 * every index between where the row was and where it was sent, and reporting those
 * would answer the caller's own instruction with a stream of crossings back.
 */
type Glide = { from: number; target: number; startedAt: number; isCommanded: boolean };

export type InertialStripOptions = {
  /** How many cells the row holds, which is what bounds the travel. */
  count: number;
  /** The cell the row has come to rest **under the notch**, reported once per crossing and only for motion the reader made. */
  onNotch: (index: number) => void;
};

/**
 * A horizontal row of equal cells the reader drags by hand, with a flick's own
 * momentum and a landing snapped to whichever cell ends up in the middle —
 * DESIGN.md § 7.10.'s filmstrip.
 *
 * The row's position is a `transform` this hook owns, never a scroll offset, and it
 * never enters React state: a scrub repaints the row directly and re-renders nothing
 * until the notch actually crosses a cell.
 *
 * WARN: That ownership is the whole point, and it replaced a native scroller. A
 * scroller's position belongs to the browser and arrives back as an asynchronous
 * `scroll` that says nothing about who caused it — so the strip had to *guess*
 * whether a scroll was the reader's or its own centring, and a wrong guess closed a
 * loop between this row and the viewer's track that froze the tab.
 * WARN: The cost is the platform's rubber-banding and momentum curve, which is why
 * both are written out above rather than left to the compositor.
 */
export function useInertialStrip<T extends HTMLElement = HTMLElement>({
  count,
  onNotch,
}: InertialStripOptions) {
  const rowRef = useRef<Nullable<T>>(null);
  const offsetRef = useRef(0);
  const pitchRef = useRef(0);
  const countRef = useRef(count);
  const dragRef = useRef<Nullable<Drag>>(null);
  // WARN: Outlives the drag on purpose. A `click` is dispatched after `pointerup`, by which point `dragRef` has been cleared — read off that, the guard below never fired and a drag released over a thumbnail activated it.
  const hasTravelledRef = useRef(false);
  const glideRef = useRef<Nullable<Glide>>(null);
  const frameRef = useRef(0);
  // WARN: The last index this hook and its caller agree on, and the only thing standing between the two. `moveTo` refuses one it already holds, so an index that travels out through `onNotch` and comes back as the caller's own instruction stops here instead of moving the row a second time.
  const notchRef = useRef(0);
  const onNotchRef = useRef(onNotch);

  // WARN: Held in a ref rather than taken as a dependency below. `onNotch` closes over the caller's current cell, so it changes identity on the very crossing it is reporting — and a `moveTo` rebuilt on that identity would be a fresh arrow on every render.
  useEffect(() => {
    onNotchRef.current = onNotch;
  });

  /**
   * The cell pitch, measured off the row rather than written down.
   *
   * INFO: The end insets are the first cell's own margin (a percentage of the row, so it follows the shell), which `offsetLeft` already accounts for — the difference between two cells is the cell plus the gap whatever either is.
   */
  useIsomorphicLayoutEffect(() => {
    countRef.current = count;

    const [first, second] = Array.from(rowRef.current?.children ?? []);

    if (first instanceof HTMLElement) {
      pitchRef.current =
        second instanceof HTMLElement ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
    }
  }, [count]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  /**
   * Sends the row to `index` without reporting the cells it passes — the caller's
   * half of the notch, for a crossing made anywhere but on the strip.
   *
   * WARN: Refused while a hand is on the row. During a scrub the film is the reader's and the slide follows it; moving it here would drag the row out from under the finger.
   */
  const moveTo = useCallback((index: number, isAnimated: boolean) => {
    if (dragRef.current || index === notchRef.current) {
      return;
    }

    notchRef.current = index;
    cancelGlide();

    if (isAnimated) {
      glide(toOffset(index), true);

      return;
    }

    offsetRef.current = toOffset(index);
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    rowRef,
    moveTo,
    /**
     * WARN: Every pointer type, unlike the scroller this replaced — a finger no longer has a native pan to fall back on, so touch is handled here or not at all.
     */
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      /** WARN: A mouse press on a thumbnail starts a native drag, which cancels the pointer stream mid-scrub and leaves a ghost of the picture under the cursor. */
      onDragStart: (event: DragEvent<HTMLElement>) => event.preventDefault(),
      /** WARN: Capture phase, and it is what keeps a drag that ends over a thumbnail from selecting it — the `click` is dispatched at their common ancestor, so a bubble-phase handler would run after the thumbnail's own. */
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (!hasTravelledRef.current) {
          return;
        }

        hasTravelledRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    },
  };

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    // WARN: A second pointer is ignored rather than adopted. Replacing the drag orphans the first finger's stream — its moves fail the `pointerId` test below — and the release of whichever finger lifts first would then clear `dragRef` and let `moveTo` move the row while a hand is still on it.
    if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    cancelGlide();
    hasTravelledRef.current = false;

    dragRef.current = {
      pointerId: event.pointerId,
      origin: event.clientX,
      offsetAtStart: offsetRef.current,
      samples: [{ x: event.clientX, at: event.timeStamp }],
      hasTravelled: false,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    // WARN: A press that never passed `GESTURE_SLOP` takes no pointer capture, so one released off the element reports neither `pointerup` nor `pointercancel` — and the armed origin would then turn the next **hover** into a scrub under a hand that is holding nothing.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      endDrag(event);

      return;
    }

    const travelled = event.clientX - drag.origin;

    if (!drag.hasTravelled) {
      if (Math.abs(travelled) < GESTURE_SLOP) {
        return;
      }

      drag.hasTravelled = true;
      hasTravelledRef.current = true;
      // WARN: Captured here and never at the press. Capturing at `pointerdown` retargets the events a `click` is derived from, so every tap on a thumbnail would be delivered to the row instead.
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    drag.samples.push({ x: event.clientX, at: event.timeStamp });

    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].at > VELOCITY_WINDOW) {
      drag.samples.shift();
    }

    offsetRef.current = withRubberBand(drag.offsetAtStart + travelled);
    paint();
    reportNotch();
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    // WARN: A press that never travelled expressed no destination, so the row resumes the one it was already on rather than landing where the press happened to stop it. Snapped as a release instead, a tap that interrupted a commanded ease reported the notch it stranded the row over — and a tap on the empty band beside a short strip sent the reader to a slide they never chose.
    if (!drag.hasTravelled) {
      glide(toOffset(notchRef.current), true);

      return;
    }

    // INFO: A release with no speed left in it takes the same path — the projection is zero and what is left is the snap back onto the nearest notch.
    glide(toOffset(toIndex(offsetRef.current + toVelocity(drag, event) * THROW_PROJECTION)), false);
  }

  /** The speed the row left the finger at, in pixels per millisecond. */
  function toVelocity(drag: Drag, event: PointerEvent<HTMLElement>): number {
    const last = { x: event.clientX, at: event.timeStamp };
    const first = drag.samples.find((sample) => last.at - sample.at <= VELOCITY_WINDOW);
    const elapsed = first ? last.at - first.at : 0;

    return first && elapsed > 0 ? (last.x - first.x) / elapsed : 0;
  }

  function glide(target: number, isCommanded: boolean) {
    const from = offsetRef.current;

    if (Math.abs(target - from) < SETTLE_EPSILON) {
      offsetRef.current = target;
      paint();

      if (!isCommanded) {
        reportNotch();
      }

      return;
    }

    glideRef.current = { from, target, startedAt: performance.now(), isCommanded };
    frameRef.current = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    const current = glideRef.current;

    if (!current) {
      return;
    }

    // WARN: The elapsed term is clamped at zero because the two clocks can disagree in that direction. A frame's input tasks are dispatched *before* "update the rendering", so a `requestAnimationFrame` scheduled from `pointerup` can run in the same frame with a `now` that predates the `performance.now()` stamped beside it — and a negative elapsed makes the exponential exceed 1, which throws the row backwards past where it was released.
    const remaining =
      (current.from - current.target) *
      Math.exp(-Math.max(now - current.startedAt, 0) / DECAY_TIME_CONSTANT);
    const hasSettled = Math.abs(remaining) < SETTLE_EPSILON;

    offsetRef.current = hasSettled ? current.target : current.target + remaining;
    paint();

    if (!current.isCommanded) {
      reportNotch();
    }
    if (hasSettled) {
      glideRef.current = null;

      return;
    }

    frameRef.current = requestAnimationFrame(tick);
  }

  function cancelGlide() {
    cancelAnimationFrame(frameRef.current);
    glideRef.current = null;
  }

  function paint() {
    const row = rowRef.current;

    if (row) {
      row.style.transform = `translate3d(${offsetRef.current}px, 0, 0)`;
    }
  }

  function reportNotch() {
    const index = toIndex(offsetRef.current);

    if (index === notchRef.current) {
      return;
    }

    notchRef.current = index;
    onNotchRef.current(index);
  }

  function toOffset(index: number): number {
    return -index * pitchRef.current;
  }

  function toIndex(offset: number): number {
    const pitch = pitchRef.current;

    return pitch > 0 ? clamp(Math.round(-offset / pitch), 0, countRef.current - 1) : 0;
  }

  function withRubberBand(offset: number): number {
    const min = toOffset(countRef.current - 1);

    if (offset > 0) {
      return offset * RUBBER_BAND_FACTOR;
    }
    if (offset < min) {
      return min + (offset - min) * RUBBER_BAND_FACTOR;
    }

    return offset;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
