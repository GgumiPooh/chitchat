"use client";

import type { Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// INFO: Height of the menu bar region including vertical margins (6px mt + 24px segment + 8px py + 2px mb = 40px), matching --emoticon-menu-height in theme.css.
export const EMOTICON_MENU_HEIGHT = 40;

const SNAP_THRESHOLD = 0.5;
const FLICK_VELOCITY = 0.3; // px per ms for fast fling snap
const SETTLING_DURATION_MS = 220;

export type UseEmoticonMenuCollapseOptions = {
  activeTab?: string;
  isOpen?: boolean;
  isSearching?: boolean;
  menuHeight?: number;
  scrollerRef: RefObject<Nullable<HTMLElement>>;
};

export type EmoticonMenuCollapse = {
  collapse: () => void;
  collapseOffset: number;
  expand: () => void;
  isCollapsed: boolean;
  isSettling: boolean;
};

/**
 * Direct manipulation & snapping collapsible header for the emoticon drawer category menu.
 * Follows KakaoTalk's behavior: tracks finger drag 1:1, and snaps cleanly to fully collapsed
 * or fully expanded upon gesture completion so no intermediate state is ever left resting.
 */
export function useEmoticonMenuCollapse({
  activeTab,
  isOpen = true,
  isSearching = false,
  menuHeight = EMOTICON_MENU_HEIGHT,
  scrollerRef,
}: UseEmoticonMenuCollapseOptions): EmoticonMenuCollapse {
  const [collapseOffset, setCollapseOffset] = useState(0);
  const [isSettling, setIsSettling] = useState(false);

  // INFO: When closed or searching, always reset to fully expanded without cascading effect renders.
  const effectiveOffset = !isOpen || isSearching ? 0 : collapseOffset;
  const isCollapsed = effectiveOffset >= menuHeight * 0.5;

  const collapseOffsetRef = useRef(0);
  const settlingTimerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  useEffect(() => {
    collapseOffsetRef.current = effectiveOffset;
  }, [effectiveOffset]);

  const settleTo = useCallback((target: number) => {
    setIsSettling(true);
    setCollapseOffset(target);

    if (settlingTimerRef.current) {
      clearTimeout(settlingTimerRef.current);
    }
    settlingTimerRef.current = setTimeout(() => {
      setIsSettling(false);
      settlingTimerRef.current = null;
    }, SETTLING_DURATION_MS);
  }, []);

  const expand = useCallback(() => settleTo(0), [settleTo]);
  const collapse = useCallback(() => settleTo(menuHeight), [settleTo, menuHeight]);

  useEffect(() => {
    return () => {
      if (settlingTimerRef.current) {
        clearTimeout(settlingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !isOpen || isSearching) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      setIsSettling(false);

      gestureRef.current = {
        axis: null,
        lastTime: Date.now(),
        lastY: touch.clientY,
        startOffset: collapseOffsetRef.current,
        startScrollTop: scroller.scrollTop,
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: Date.now(),
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      const deltaX = Math.abs(touch.clientX - gesture.startX);
      const deltaY = gesture.startY - touch.clientY; // positive = dragging finger up
      const absY = Math.abs(deltaY);

      gesture.lastY = touch.clientY;
      gesture.lastTime = Date.now();

      if (!gesture.axis) {
        if (Math.hypot(deltaX, absY) < 6) {
          return;
        }
        gesture.axis = deltaX > absY ? "horizontal" : "vertical";
      }

      if (gesture.axis === "horizontal") {
        return;
      }

      // Case 1: Currently expanded or in-progress collapse
      if (gesture.startOffset < menuHeight) {
        if (deltaY > 0) {
          if (deltaY <= menuHeight) {
            // WARN: Cancel native scroll while menu bar is absorbing the travel to avoid 2x speed jump.
            if (event.cancelable) {
              event.preventDefault();
            }
            const next = Math.min(menuHeight, gesture.startOffset + deltaY);
            collapseOffsetRef.current = next;
            setCollapseOffset(next);
            scroller.scrollTop = 0;
          } else {
            collapseOffsetRef.current = menuHeight;
            setCollapseOffset(menuHeight);
            scroller.scrollTop = deltaY - (menuHeight - gesture.startOffset);
          }
        } else {
          collapseOffsetRef.current = 0;
          setCollapseOffset(0);
        }
      }
      // Case 2: Currently fully collapsed
      else {
        // Dragging down while at top of scroller pulls the menu back into view
        if (gesture.startScrollTop <= 0 && deltaY < 0 && scroller.scrollTop <= 0) {
          if (event.cancelable) {
            event.preventDefault();
          }
          const next = Math.max(0, menuHeight + deltaY);
          collapseOffsetRef.current = next;
          setCollapseOffset(next);
        }
      }
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || gesture.axis === "horizontal") {
        return;
      }

      const currentOffset = collapseOffsetRef.current;
      const duration = Math.max(1, Date.now() - gesture.startedAt);
      const travelY = gesture.startY - gesture.lastY;
      const velocity = travelY / duration;

      if (currentOffset > 0 && currentOffset < menuHeight) {
        let targetOffset: number;

        if (Math.abs(velocity) > FLICK_VELOCITY) {
          targetOffset = velocity > 0 ? menuHeight : 0;
        } else {
          targetOffset = currentOffset >= menuHeight * SNAP_THRESHOLD ? menuHeight : 0;
        }

        settleTo(targetOffset);
      }
    };

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 10) {
        return;
      }

      if (event.deltaY > 0 && collapseOffsetRef.current < menuHeight) {
        collapse();
      } else if (event.deltaY < 0 && scroller.scrollTop <= 0 && collapseOffsetRef.current > 0) {
        expand();
      }
    };

    const gestureRef = {
      current: null as Nullable<{
        axis: Nullable<"vertical" | "horizontal">;
        lastTime: number;
        lastY: number;
        startOffset: number;
        startScrollTop: number;
        startX: number;
        startY: number;
        startedAt: number;
      }>,
    };

    scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
    scroller.addEventListener("touchmove", handleTouchMove, { passive: false });
    scroller.addEventListener("touchend", handleTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    scroller.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      scroller.removeEventListener("touchstart", handleTouchStart);
      scroller.removeEventListener("touchmove", handleTouchMove);
      scroller.removeEventListener("touchend", handleTouchEnd);
      scroller.removeEventListener("touchcancel", handleTouchEnd);
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, [activeTab, collapse, expand, isOpen, isSearching, menuHeight, scrollerRef, settleTo]);

  return {
    collapse,
    collapseOffset: effectiveOffset,
    expand,
    isCollapsed,
    isSettling,
  };
}
