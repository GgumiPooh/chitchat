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
 * anywhere that does not scroll vertically — the handle, the menu bar, the strip: a
 * drag follows the finger, a release snaps past `SNAP_SHARE` — up to expanded, down to
 * rest, down from rest to closed — and a tap on the handle (`handleProps`) toggles
 * rest ⇄ expanded. `pinnedHeight` is a px height that overrides
 * the size while a finger holds the sheet and through a collapse that finger began;
 * `expandedHeight` is the sheet's height at the header.
 */
export function useEmoticonSheet({ sheetRef, isOpen, onClose }: EmoticonSheetOptions) {
  const [size, setSize] = useState<EmoticonSheetSize>("rest");
  const [expandedHeight, setExpandedHeight] = useState(0);
  const [pinnedHeight, setPinnedHeight] = useState<Nullable<number>>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  const gestureRef =
    useRef<Nullable<{ pointerId: number; x: number; y: number; height: number; max: number }>>(
      null,
    );
  const hasDraggedRef = useRef(false);

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
      onLostPointerCapture: () => gestureRef.current !== null && handleCancel(),
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

    // INFO: § 13.6. The grid keeps its own scroll: a press inside a vertical scroller is its own, and only the rows above it can begin a drag.
    if (isInsideVerticalScroller(event.target, sheet)) {
      return;
    }

    hasDraggedRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      height: sheet.getBoundingClientRect().height,
      max: measureExpandedHeight(),
    };
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
      if (sideways > Math.abs(pulled)) {
        gestureRef.current = null;

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

function isInsideVerticalScroller(target: EventTarget, sheet: HTMLElement): boolean {
  let node = target instanceof Element ? target : null;

  while (node && node !== sheet) {
    const { overflowY } = getComputedStyle(node);

    if (overflowY === "auto" || overflowY === "scroll") {
      return true;
    }

    node = node.parentElement;
  }

  return false;
}
