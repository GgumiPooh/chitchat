"use client";

import { useCallback, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { A_SECOND } from "../date/time";
import { GESTURE_SLOP } from "../input/gesture";
import type { Nullable } from "../nullish";

/** REQUIREMENTS.md § 18. #6. Tuned on a real device; every other number here follows from these three. */
export const MIN_ZOOM_SCALE = 1;

export const MAX_ZOOM_SCALE = 4;

export const DOUBLE_TAP_ZOOM_SCALE = 2;

// INFO: REQUIREMENTS.md § 13.6. The same window the emoticon double tap counts on, and for the same reason — `dblclick` never arrives on touch.
const DOUBLE_TAP_WINDOW = A_SECOND / 3;

// INFO: How much of the overshoot past a bound survives as movement. Low enough that the bound is felt, high enough that the pinch does not read as jammed.
const RUBBER_BAND_FACTOR = 0.3;

// INFO: Wheel delta that doubles the scale, tuned against a macOS trackpad pinch — which reports a stream of small deltas rather than the ~100 a mouse notch carries.
const WHEEL_ZOOM_SENSITIVITY = 120;

// INFO: A wheel gesture has no lift to settle on, so the stream going quiet is the release. Long enough to span the gaps inside one trackpad pinch, short enough that the clamp lands while the fingers are still on the glass.
const WHEEL_SETTLE_DELAY = A_SECOND / 8;

type Point = { x: number; y: number };

type Transform = { scale: number; x: number; y: number };

const IDENTITY: Transform = { scale: MIN_ZOOM_SCALE, x: 0, y: 0 };

type PinchOrigin = {
  distance: number;
  midpoint: Point;
  transform: Transform;
};

/**
 * REQUIREMENTS.md § 8.1., § 18. #6. Pinch to zoom a viewer slide, pan while zoomed,
 * double tap to toggle. The horizontal swipe between slides stays native scroll
 * snapping — this hook only reports `isZoomed` so the track can be frozen while it is.
 *
 * WARN: `touch-action: none` belongs on the element taking these handlers, but only
 * once a gesture owns it. Applied unconditionally it would eat the track's swipe at
 * rest, which is the one half of § 18. #6 that was already settled.
 */
export function usePinchZoom() {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [isGesturing, setIsGesturing] = useState(false);
  const pointersRef = useRef(new Map<number, Point>());
  const pinchOriginRef = useRef<Nullable<PinchOrigin>>(null);
  const panOriginRef = useRef<Nullable<{ point: Point; transform: Transform }>>(null);
  const lastTapRef = useRef(0);
  // WARN: A pan and a double tap both end in a `click`, and the viewer closes on one that misses the photo. This is what tells the two apart from a tap that really was aimed past it.
  const hasMovedRef = useRef(false);
  // WARN: Movement is tracked at every scale, not only while panning. At rest the finger is swiping the track, and two quick swipes land inside the double-tap window — untracked, they read as a double tap and zoom the slide the reader was leaving.
  const startPointRef = useRef<Nullable<Point>>(null);
  const elementRef = useRef<Nullable<HTMLElement>>(null);
  const wheelSettleRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  const isZoomed = transform.scale > MIN_ZOOM_SCALE;

  const reset = useCallback(() => {
    setTransform(IDENTITY);
    setIsGesturing(false);
    pointersRef.current.clear();
    pinchOriginRef.current = null;
    panOriginRef.current = null;
  }, []);

  const settle = useCallback(() => {
    setIsGesturing(false);
    setTransform((current) => {
      const scale = clamp(current.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

      // WARN: The element is not optional here. Without it `withClampedOffset` has no box to clamp against and recentres instead, so every release threw away the region the reader had just pinched into.
      return scale === MIN_ZOOM_SCALE
        ? IDENTITY
        : withClampedOffset({ ...current, scale }, elementRef.current);
    });
  }, []);

  /**
   * AGENTS.md § 4.2. The desktop half of the pinch: macOS reports a trackpad pinch as
   * a `wheel` with `ctrlKey`, and every browser spends that on **page** zoom.
   *
   * WARN: Page zoom is what the viewer could not survive. It resizes the visual viewport under a `fixed` layer (`ShellOverlay`, DESIGN.md § 4.4.) while the layout viewport stays put, so the overlay is left offset from the screen it is supposed to be — the tearing the reader sees. Taking the gesture here is what keeps the browser out of it.
   * INFO: Only `ctrlKey`. A bare wheel is the trackpad's two-finger scroll, which `MediaViewer` still wants for the track.
   */
  const zoomByWheel = useCallback(
    (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();

      const element = elementRef.current;

      // WARN: The refusal above is unconditional and the zoom below is not. A slide with no gesture surface — a video, a placeholder — has nothing to scale, and scaling it anyway would set `isZoomed` and freeze the track over a photo that never moved.
      if (!element) {
        return;
      }

      const focus = toLocalPoint({ x: event.clientX, y: event.clientY }, element);

      setIsGesturing(true);
      setTransform((current) => {
        const scale = clamp(
          current.scale * Math.exp(-event.deltaY / WHEEL_ZOOM_SENSITIVITY),
          MIN_ZOOM_SCALE,
          MAX_ZOOM_SCALE,
        );

        return scale === MIN_ZOOM_SCALE
          ? IDENTITY
          : withClampedOffset(zoomAround(current, scale, focus), element);
      });

      if (wheelSettleRef.current !== null) {
        clearTimeout(wheelSettleRef.current);
      }

      // INFO: There is no `pointerup` to end a wheel gesture, so the stream falling quiet stands in for the lift `settle` is otherwise called from.
      wheelSettleRef.current = setTimeout(settle, WHEEL_SETTLE_DELAY);
    },
    [settle],
  );

  // INFO: The surface is the box every gesture is measured against, and nothing more — the `wheel` listener belongs on the root below.
  const captureSurface = useCallback((element: Nullable<HTMLElement>) => {
    elementRef.current = element;

    return () => {
      elementRef.current = null;
    };
  }, []);

  /**
   * Attaches the `ctrl`+`wheel` guard to the **whole overlay**, not to the gesture
   * surface inside it.
   *
   * WARN: Page zoom has to be refused everywhere the overlay covers, or it is refused nowhere that matters. A `wheel` targets the topmost element under the cursor, so one over a video slide, over a placeholder, over the padding beside a photo or over a floating control never reaches the surface — and each of those was a page zoom tearing the `fixed` layer apart, which is the very thing this exists to stop.
   * WARN: Attached by hand rather than through `onWheel`. React registers that one **passively** at the root, where `preventDefault` is ignored and the browser zooms the page anyway.
   */
  const captureRoot = useCallback(
    (element: Nullable<HTMLElement>) => {
      if (!element) {
        return;
      }

      element.addEventListener("wheel", zoomByWheel, { passive: false });

      return () => {
        element.removeEventListener("wheel", zoomByWheel);

        if (wheelSettleRef.current !== null) {
          clearTimeout(wheelSettleRef.current);
        }
      };
    },
    [zoomByWheel],
  );

  return {
    isZoomed,
    reset,
    captureRoot,
    /**
     * The transform, for an element **inside** the one taking `surfaceProps`.
     *
     * WARN: The two must not be the same element. `getBoundingClientRect` reports the
     * transformed box, so a surface that scales with the photo would measure its own
     * zoom back into the pan bounds and the clamp would tighten on every frame.
     */
    contentStyle: {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
      // INFO: A settled scale eases; a moving one must not, or every pinch frame is animated against the last and the photo lags the fingers.
      transition: isGesturing ? undefined : "transform var(--duration-state) var(--ease-press)",
    },
    surfaceProps: {
      ref: captureSurface,
      /**
       * WARN: `pan-x` at rest, never `auto` and never `pinch-zoom`. `auto` lets the
       * browser claim the pinch itself, and it then stops dispatching the pointers this
       * hook counts — the gesture reads as nothing happening. `pinch-zoom` hands it over
       * even more explicitly. `pan-x` permits exactly the track's own swipe (§ 8.1.) and
       * reserves everything else, so the second finger still reaches JS. The track only
       * ever scrolls horizontally, so nothing else is given up.
       */
      style: { touchAction: isZoomed || isGesturing ? ("none" as const) : ("pan-x" as const) },
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        elementRef.current = event.currentTarget;

        const pointers = pointersRef.current;

        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 2) {
          event.currentTarget.setPointerCapture(event.pointerId);
          setIsGesturing(true);
          hasMovedRef.current = true;
          panOriginRef.current = null;
          pinchOriginRef.current = readPinchOrigin(pointers, transform);

          return;
        }
        if (pointers.size === 1) {
          hasMovedRef.current = false;
          startPointRef.current = { x: event.clientX, y: event.clientY };

          if (isZoomed) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsGesturing(true);
            panOriginRef.current = { point: { x: event.clientX, y: event.clientY }, transform };
          }
        }
      },

      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const pointers = pointersRef.current;

        if (!pointers.has(event.pointerId)) {
          return;
        }

        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        const pinchOrigin = pinchOriginRef.current;

        if (pointers.size >= 2 && pinchOrigin) {
          setTransform(readPinchTransform(pointers, pinchOrigin, elementRef.current));

          return;
        }

        const start = startPointRef.current;

        if (start && hasTravelled(start, event)) {
          hasMovedRef.current = true;
        }

        const panOrigin = panOriginRef.current;

        if (!panOrigin) {
          return;
        }

        const dx = event.clientX - panOrigin.point.x;
        const dy = event.clientY - panOrigin.point.y;

        setTransform(
          withClampedOffset(
            {
              ...panOrigin.transform,
              x: panOrigin.transform.x + dx,
              y: panOrigin.transform.y + dy,
            },
            elementRef.current,
          ),
        );
      },

      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        const pointers = pointersRef.current;

        pointers.delete(event.pointerId);

        // WARN: A pinch does not become a pan when the first finger leaves — the surviving pointer has no origin of its own, and adopting it would jump the photo by the whole distance between the two.
        if (pointers.size < 2) {
          pinchOriginRef.current = null;
        }
        if (pointers.size === 0) {
          panOriginRef.current = null;
          settle();
          handleTap(event);
        }
      },

      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        pointersRef.current.delete(event.pointerId);

        if (pointersRef.current.size === 0) {
          pinchOriginRef.current = null;
          panOriginRef.current = null;
          settle();
        }
      },

      /**
       * Keeps the double **click** from selecting the photo it zooms.
       *
       * WARN: `detail > 1` is the second click of the pair and nothing else — that is the one the browser extends a selection from, so the first click keeps every default it has, focus included.
       * WARN: Never `user-select: none`, and never `draggable={false}` (REQUIREMENTS.md § 8.11.). This is the one surface in the app that leaves the OS its own hold gesture, and iOS governs that menu off the same family of properties — suppressing the selection declaratively is how the 사진에 저장 route disappears on a change that looks purely cosmetic.
       */
      onMouseDown: (event: MouseEvent<HTMLElement>) => {
        if (event.detail > 1) {
          event.preventDefault();
        }
      },

      // WARN: Suppresses the `click` a pan or a double tap ends in, so the viewer's own backdrop handler never reads one as a tap past the photo.
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        if (hasMovedRef.current) {
          event.stopPropagation();
          hasMovedRef.current = false;
        }
      },
    },
  };

  function handleTap(event: PointerEvent<HTMLElement>) {
    if (hasMovedRef.current) {
      return;
    }

    const now = Date.now();

    if (now - lastTapRef.current > DOUBLE_TAP_WINDOW) {
      lastTapRef.current = now;

      return;
    }

    lastTapRef.current = 0;
    hasMovedRef.current = true;

    setTransform((current) =>
      current.scale > MIN_ZOOM_SCALE
        ? IDENTITY
        : withClampedOffset(
            zoomAround(IDENTITY, DOUBLE_TAP_ZOOM_SCALE, readLocalPoint(event, elementRef.current)),
            elementRef.current,
          ),
    );
  }
}

function readPinchOrigin(pointers: Map<number, Point>, transform: Transform): PinchOrigin {
  const [first, second] = [...pointers.values()];

  return {
    distance: Math.max(distanceBetween(first, second), 1),
    midpoint: midpointOf(first, second),
    transform,
  };
}

function readPinchTransform(
  pointers: Map<number, Point>,
  origin: PinchOrigin,
  element: Nullable<HTMLElement>,
): Transform {
  const [first, second] = [...pointers.values()];
  const ratio = distanceBetween(first, second) / origin.distance;
  const scale = rubberBand(origin.transform.scale * ratio);
  const midpoint = midpointOf(first, second);
  const zoomed = zoomAround(origin.transform, scale, toLocalPoint(origin.midpoint, element));

  // INFO: The midpoint travelling is a two-finger drag, so the photo follows it — this is what makes a pinch that lands off-centre reachable without a second pan.
  return {
    ...zoomed,
    x: zoomed.x + (midpoint.x - origin.midpoint.x),
    y: zoomed.y + (midpoint.y - origin.midpoint.y),
  };
}

/** Keeps `focus` — a point in the element's own coordinates — under the same pixel as the scale changes. */
function zoomAround(transform: Transform, scale: number, focus: Point): Transform {
  const ratio = scale / transform.scale;

  return {
    scale,
    x: focus.x - (focus.x - transform.x) * ratio,
    y: focus.y - (focus.y - transform.y) * ratio,
  };
}

// INFO: REQUIREMENTS.md § 18. #6. Past either bound the pinch keeps moving but gives ground, so the limit is felt rather than hit. `settle` is what puts it back.
function rubberBand(scale: number): number {
  if (scale > MAX_ZOOM_SCALE) {
    return MAX_ZOOM_SCALE + (scale - MAX_ZOOM_SCALE) * RUBBER_BAND_FACTOR;
  }
  if (scale < MIN_ZOOM_SCALE) {
    return MIN_ZOOM_SCALE - (MIN_ZOOM_SCALE - scale) * RUBBER_BAND_FACTOR;
  }

  return scale;
}

/**
 * WARN: Clamped against the element's box rather than the painted photo inside it.
 * `object-contain` letterboxes the asset, so a portrait slide's own gutters are pannable
 * — the alternative is reading `naturalWidth` here, which is unavailable until the
 * original decodes and would leave the bounds wrong for the first frames of a cold slide.
 */
function withClampedOffset(transform: Transform, element?: Nullable<HTMLElement>): Transform {
  const rect = element?.getBoundingClientRect();

  if (!rect || transform.scale <= MIN_ZOOM_SCALE) {
    return { ...transform, x: 0, y: 0 };
  }

  const overflowX = (rect.width * (transform.scale - 1)) / 2;
  const overflowY = (rect.height * (transform.scale - 1)) / 2;

  return {
    ...transform,
    x: clamp(transform.x, -overflowX, overflowX),
    y: clamp(transform.y, -overflowY, overflowY),
  };
}

function readLocalPoint(event: PointerEvent<HTMLElement>, element: Nullable<HTMLElement>): Point {
  return toLocalPoint({ x: event.clientX, y: event.clientY }, element);
}

/** Client coordinates relative to the element's centre, which is where a `scale` transform grows from. */
function toLocalPoint(point: Point, element: Nullable<HTMLElement>): Point {
  const rect = element?.getBoundingClientRect();

  if (!rect) {
    return { x: 0, y: 0 };
  }

  return { x: point.x - (rect.left + rect.width / 2), y: point.y - (rect.top + rect.height / 2) };
}

function hasTravelled(start: Point, event: PointerEvent<HTMLElement>): boolean {
  return (
    Math.abs(event.clientX - start.x) > GESTURE_SLOP ||
    Math.abs(event.clientY - start.y) > GESTURE_SLOP
  );
}

function distanceBetween(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpointOf(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
