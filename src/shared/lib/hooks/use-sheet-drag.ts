"use client";

import { APP_HEADER_ID } from "@/shared/config";
import { GESTURE_SLOP, type Nullable } from "@/shared/lib";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";

export type SheetSize = "rest" | "expanded";

const DEFAULT_SNAP_SHARE = 0.25;

export type UseSheetDragOptions = {
  closeOnPullDownFromExpanded?: boolean;
  initialSize?: SheetSize;
  isOpen: boolean;
  sheetRef: RefObject<Nullable<HTMLElement>>;
  snapShare?: number;
  onClose: () => void;
};

/**
 * Bottom sheet drag gesture hook: tracks finger drag smoothly, allows pulling down to close / collapse,
 * pulling up to expand when scroller reaches the bottom (or on non-scrollable areas),
 * and handles snap settling and click swallowing after drag.
 */
export function useSheetDrag({
  sheetRef,
  isOpen,
  snapShare = DEFAULT_SNAP_SHARE,
  initialSize = "rest",
  closeOnPullDownFromExpanded = false,
  onClose,
}: UseSheetDragOptions) {
  const [size, setSize] = useState<SheetSize>(initialSize);
  const [expandedHeight, setExpandedHeight] = useState(0);
  const [pinnedHeight, setPinnedHeight] = useState<Nullable<number>>(null);
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingClose, setIsDraggingClose] = useState(false);
  const [isSettlingClose, setIsSettlingClose] = useState(false);
  // WARN: A single-frame flag that is true only in the render where the 200ms
  // close animation has completed and every piece of close state (dragTranslateY,
  // isDraggingClose, isSettlingClose) resets to its resting value alongside
  // `onClose()`. Callers that apply CSS transitions to elements driven by
  // `dragTranslateY` MUST gate `transition-none` on this flag so that resetting
  // `dragTranslateY` from `targetTranslateY` → 0 does not animate those
  // elements backward from off-screen. Without it, the transition fires after the
  // animation has already played and the sheet/composer slides back up into view.
  const [isResettingAfterClose, setIsResettingAfterClose] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const closeTimerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);
  const gestureRef = useRef<
    Nullable<{
      pointerId: number;
      x: number;
      y: number;
      height: number;
      max: number;
      scroller: Nullable<HTMLElement>;
      takesPullDown: boolean;
      takesPullUp: boolean;
    }>
  >(null);
  const hasDraggedRef = useRef(false);
  const panDenialRef =
    useRef<Nullable<{ element: HTMLElement; deny: (event: TouchEvent) => void }>>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);

    if (isOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setIsSettlingClose(false);
      setIsDraggingClose(false);
      setIsResettingAfterClose(false);
      setSize(initialSize);
      setPinnedHeight(null);
      setDragTranslateY(0);
    }
  }

  useEffect(() => {
    if (size !== "expanded") {
      return;
    }

    const observer = new ResizeObserver(() => {
      const next = measureExpandedHeight();

      if (next > 0) {
        setExpandedHeight(next);
      }
    });

    observer.observe(document.documentElement);

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return {
    size,
    expandedHeight,
    pinnedHeight,
    dragTranslateY,
    isDragging,
    isDraggingClose,
    isSettlingClose,
    isResettingAfterClose,
    collapse: () => settle("rest", expandedHeight),
    expand: () => settle("expanded", measureExpandedHeight()),
    dragProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handleRelease,
      onPointerCancel: handleCancel,
      onLostPointerCapture: (event: PointerEvent) => {
        if (gestureRef.current !== null && event.target === event.currentTarget) {
          handleCancel();
        }
      },
      onClickCapture: swallowClickAfterDrag,
    },
    handleProps: { onClick: handleClick },
  };

  function measureExpandedHeight(): number {
    const sheet = sheetRef.current;
    const header = document.getElementById(APP_HEADER_ID);

    if (!sheet) {
      return 0;
    }

    // INFO: The sheet is anchored to the bottom of the viewport / chat scroller. Expanded height is the distance from sheet bottom to the bottom of the header (or top safe margin).
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    const sheetBottom = sheet.getBoundingClientRect().bottom || window.innerHeight;

    return Math.max(sheetBottom - headerBottom, 0);
  }

  function handlePointerDown(event: PointerEvent) {
    const sheet = sheetRef.current;

    if (!event.isPrimary || !sheet || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const scroller = findVerticalScroller(event.target, sheet);

    const takesPullDown = !scroller || scroller.scrollTop <= 0;
    const takesPullUp =
      !scroller ||
      (size !== "expanded" &&
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1);

    if (!takesPullDown && !takesPullUp) {
      return;
    }

    hasDraggedRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      height: sheet.getBoundingClientRect().height,
      max: measureExpandedHeight(),
      scroller,
      takesPullDown,
      takesPullUp,
    };

    if (scroller) {
      denyPanWhilePullingDown(scroller);
    }
  }

  function denyPanWhilePullingDown(element: HTMLElement) {
    releasePanDenial();

    const deny = (touchEvent: TouchEvent) => {
      const gesture = gestureRef.current;
      const touch = touchEvent.touches[0];

      if (!gesture || !touch || !touchEvent.cancelable) {
        return;
      }

      const takes = touch.clientY < gesture.y ? gesture.takesPullUp : gesture.takesPullDown;

      if (hasDraggedRef.current || takes) {
        touchEvent.preventDefault();
      }
    };

    element.addEventListener("touchmove", deny, { passive: false });
    panDenialRef.current = { element, deny };
  }

  function releasePanDenial() {
    const held = panDenialRef.current;

    if (held) {
      held.element.removeEventListener("touchmove", held.deny);
      panDenialRef.current = null;
    }
  }

  function handlePointerMove(event: PointerEvent) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    if (event.pointerType === "mouse" && event.buttons === 0) {
      handleCancel();

      return;
    }

    const pulled = gesture.y - event.clientY;

    if (!hasDraggedRef.current) {
      const sideways = Math.abs(event.clientX - gesture.x);

      if (Math.max(Math.abs(pulled), sideways) < GESTURE_SLOP) {
        return;
      }

      if (
        sideways > Math.abs(pulled) ||
        (pulled > 0 ? !gesture.takesPullUp : !gesture.takesPullDown)
      ) {
        gestureRef.current = null;
        releasePanDenial();

        return;
      }

      hasDraggedRef.current = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (pulled < 0) {
      if (size === "expanded" && !closeOnPullDownFromExpanded) {
        // INFO: Dragging down from expanded mode shrinks height directly to reveal the composer beneath without translating the bottom edge.
        setPinnedHeight(Math.max(gesture.height + pulled, 0));
        setDragTranslateY(0);
      } else {
        // WARN: Dragging down from rest mode translates the whole panel so the composer and sheet slide as a unit with the finger.
        setPinnedHeight(gesture.height);
        setDragTranslateY(-pulled);
      }
    } else {
      // Dragging up to expand: grow height, no translation.
      setDragTranslateY(0);
      setPinnedHeight(Math.min(gesture.height + pulled, gesture.max));
    }
  }

  function handleRelease(event: PointerEvent) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    gestureRef.current = null;
    releasePanDenial();

    if (!hasDraggedRef.current) {
      return;
    }

    setIsDragging(false);

    const pulled = gesture.y - event.clientY;
    const threshold = gesture.height * snapShare;
    // INFO: When expanded, dragging down past half the sheet or more than twice the collapse threshold closes the sheet directly.
    const closeThreshold = Math.max(threshold * 2, gesture.height * 0.5);

    if (size === "expanded" && !closeOnPullDownFromExpanded) {
      setPinnedHeight(null);

      if (pulled < -closeThreshold) {
        animateClose(gesture.height);
      } else if (pulled < -threshold) {
        setDragTranslateY(0);
        setSize("rest");
        blurInside();
      } else {
        setDragTranslateY(0);
      }
    } else if (pulled > threshold && size === "rest") {
      setDragTranslateY(0);
      settle("expanded", gesture.max);
    } else if (pulled < -threshold) {
      setPinnedHeight(null);
      animateClose(gesture.height);
    } else {
      setDragTranslateY(0);
      setPinnedHeight(null);
    }
  }

  function animateClose(targetTranslateY: number) {
    setIsDraggingClose(true);
    setIsSettlingClose(true);
    setDragTranslateY(targetTranslateY);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      // WARN: All five state changes and `onClose()` are batched into one React
      // render by React 18's automatic batching. `isResettingAfterClose=true` is
      // set in that same batch so that callers can apply `transition-none` to
      // every element that carried `translateY(targetTranslateY)` — the container
      // (which owns `--chat-composer-spacer`) and the translated elements (sheet,
      // composer, pill). With transitions suppressed, `dragTranslateY → 0` and
      // the spacer value change both snap instantly rather than animating backward.
      // One rAF later `isResettingAfterClose` clears; every element is already at
      // its final value and there is nothing left for CSS transitions to animate.
      setIsResettingAfterClose(true);
      setIsSettlingClose(false);
      setIsDraggingClose(false);
      setDragTranslateY(0);
      onClose();
      requestAnimationFrame(() => {
        setIsResettingAfterClose(false);
      });
    }, 200);
  }

  function handleCancel() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsSettlingClose(false);
    setIsDraggingClose(false);
    setIsResettingAfterClose(false);
    gestureRef.current = null;
    releasePanDenial();
    hasDraggedRef.current = false;
    setIsDragging(false);
    setDragTranslateY(0);
    setPinnedHeight(null);
  }

  function swallowClickAfterDrag(event: MouseEvent) {
    if (!hasDraggedRef.current) {
      return;
    }

    hasDraggedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleClick() {
    if (size === "expanded") {
      if (closeOnPullDownFromExpanded || initialSize === "expanded") {
        onClose();
      } else {
        setSize("rest");
      }
    } else {
      settle("expanded", measureExpandedHeight());
    }
  }

  function blurInside() {
    const active = document.activeElement;

    if (active instanceof HTMLElement && sheetRef.current?.contains(active)) {
      active.blur();
    }
  }

  function settle(next: SheetSize, height: number) {
    setExpandedHeight(height);
    setPinnedHeight(null);
    setSize(next);
  }
}

function findVerticalScroller(target: EventTarget, sheet: HTMLElement): Nullable<HTMLElement> {
  let node = target instanceof HTMLElement ? target : null;

  while (node && node !== sheet) {
    const { overflowY } = getComputedStyle(node);

    if (overflowY === "auto" || overflowY === "scroll") {
      return node;
    }

    node = node.parentElement;
  }

  return null;
}
