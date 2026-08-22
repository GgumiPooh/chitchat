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

export type EmoticonSheetSize = "rest" | "expanded";

// INFO: A release snaps only past this share of the height the drag began at; short of it the sheet returns to where it was, so a wobble closes nothing.
const SNAP_SHARE = 0.25;

export type EmoticonSheetOptions = {
  sheetRef: RefObject<Nullable<HTMLElement>>;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 13.6. The sheet's drag, taken on the card by `dragProps` from
 * anywhere that does not scroll vertically — the handle, the menu bar, the strip —
 * and from a grid with no scroll left in the pull's direction — down at its top, up
 * at its bottom: a drag follows the
 * finger, a release snaps past `SNAP_SHARE` — up to expanded, down to rest, down from
 * rest to closed — and a tap on the handle (`handleProps`) toggles rest ⇄ expanded.
 * `pinnedHeight` is a px height that overrides the size while a finger holds the sheet
 * and through a collapse that finger began; `expandedHeight` is the sheet's height at
 * the header.
 */
export function useEmoticonSheet({ sheetRef, isOpen, onClose }: EmoticonSheetOptions) {
  const [size, setSize] = useState<EmoticonSheetSize>("rest");
  const [expandedHeight, setExpandedHeight] = useState(0);
  const [pinnedHeight, setPinnedHeight] = useState<Nullable<number>>(null);
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

  // WARN: Reset on the *reopen*, never on the close — the collapse draws the sheet at the height it was closed from, and resetting first drops it a frame before the strip clips it.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);

    if (isOpen) {
      setSize("rest");
      setPinnedHeight(null);
    }
  }

  useEffect(() => {
    if (size !== "expanded") {
      return;
    }

    // WARN: A stack put away by 메시지 검색 is `display: none` and measures 0 — kept, that would draw the next expand at nothing.
    const observer = new ResizeObserver(() => {
      const next = measureExpandedHeight();

      if (next > 0) {
        setExpandedHeight(next);
      }
    });

    observer.observe(document.documentElement);

    return () => observer.disconnect();
    // WARN: `measureExpandedHeight` reads refs only, so the size is the one dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  return {
    size,
    expandedHeight,
    pinnedHeight,
    isDragging,
    // INFO: § 13.6. A pick from the expanded sheet returns it to rest, on the ordinary ease — the spring is the upward move's alone.
    collapse: () => settle("rest", expandedHeight),
    // INFO: § 13.8. 검색's field taking focus opens the sheet to the header, on the same spring the handle's tap does.
    expand: () => settle("expanded", measureExpandedHeight()),
    dragProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handleRelease,
      onPointerCancel: handleCancel,
      // WARN: Capture is also lost after an ordinary `pointerup`, a tick before the `click` — only a gesture still armed is one that was taken away.
      // WARN: And only the card's own. A touch gives the element under the finger implicit capture, so taking it onto the card fires this on the handle or chip it left — bubbling here with an armed gesture, which dropped every drag at the slop.
      onLostPointerCapture: (event: PointerEvent) => {
        if (gestureRef.current !== null && event.target === event.currentTarget) {
          handleCancel();
        }
      },
      // WARN: A drag ends in a `click` on whatever is under the finger — a menu chip, a pack tab, the handle — and that one must not act on what the release just settled.
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

    // INFO: § 13.6. A grid lends the sheet only the pull it has no scroll left for — down at its top, up at its bottom short of expanded — and keeps every other press.
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

  // WARN: `touch-pan-y` hands a vertical touch to the browser at its first cancelable `touchmove` and `pointercancel`s the rest, so the refusal has to be a non-passive `touchmove` (React's is passive) and has to begin with the very first one — before the slop can tell the axis. It refuses only the moves the sheet can take, so the first sideways move, or a vertical one the grid still has scroll for, gives the pan back to the swipe or the grid.
  // WARN: Attached per gesture and removed with it, as `useHorizontalSwipe` does: a listener left on the grid is one that answers for every scroll the grid makes afterwards.
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

    // WARN: A press short of `GESTURE_SLOP` holds no capture, so a mouse released off the handle reports no `pointerup` — the armed origin would turn the next hover into a drag.
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

      // INFO: § 13.6. The strip scrolls sideways, so a gesture that commits to that axis is the strip's — the larger travel at the slop decides, as the tab swipe's own axis lock does.
      // INFO: § 13.6. A grid lends one direction at a time: committed the other way, the gesture is its scroll.
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

    setPinnedHeight(Math.min(Math.max(gesture.height + pulled, 0), gesture.max));
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
    const threshold = gesture.height * SNAP_SHARE;

    if (size === "expanded") {
      if (pulled < -threshold) {
        setSize("rest");
        blurInside();
      }

      setPinnedHeight(null);
    } else if (pulled > threshold) {
      settle("expanded", gesture.max);
    } else if (pulled < -threshold) {
      // INFO: The pinned height stays through the collapse, so the strip clips the sheet where the finger left it rather than jumping it back to rest first.
      onClose();
    } else {
      setPinnedHeight(null);
    }
  }

  function handleCancel() {
    gestureRef.current = null;
    releasePanDenial();
    hasDraggedRef.current = false;
    setIsDragging(false);
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
      setSize("rest");
    } else {
      settle("expanded", measureExpandedHeight());
    }
  }

  // INFO: § 13.8. A pull down from expanded is the reader leaving the field that expanded it, so the keyboard goes with the height.
  function blurInside() {
    const active = document.activeElement;

    if (active instanceof HTMLElement && sheetRef.current?.contains(active)) {
      active.blur();
    }
  }

  function settle(next: EmoticonSheetSize, height: number) {
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
