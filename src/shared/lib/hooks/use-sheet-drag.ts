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
  const [wasOpen, setWasOpen] = useState(isOpen);
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

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);

    if (isOpen) {
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

    return Math.max(
      sheet.getBoundingClientRect().bottom - (header?.getBoundingClientRect().bottom ?? 0),
      0,
    );
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
      // WARN: Dragging down — translate the whole panel rather than shrinking its height,
      // so the bottom edge stays fixed and the panel slides as a unit.
      setPinnedHeight(gesture.height);
      setDragTranslateY(-pulled);
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

    if (size === "expanded") {
      if (pulled < -threshold) {
        if (closeOnPullDownFromExpanded || initialSize === "expanded") {
          // WARN: Do NOT reset dragTranslateY here — the CSS keyframe from Radix's
          // data-[state=closed] slide-out-to-bottom overrides the inline transform, so
          // the animation continues smoothly from wherever the panel currently sits.
          onClose();
        } else {
          setDragTranslateY(0);
          setSize("rest");
          blurInside();
        }
      } else {
        setDragTranslateY(0);
      }

      setPinnedHeight(null);
    } else if (pulled > threshold) {
      setDragTranslateY(0);
      settle("expanded", gesture.max);
    } else if (pulled < -threshold) {
      // WARN: Same as above — keep dragTranslateY so close animation starts from here.
      onClose();
    } else {
      setDragTranslateY(0);
      setPinnedHeight(null);
    }
  }

  function handleCancel() {
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
