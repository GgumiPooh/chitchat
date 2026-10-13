"use client";

import type { Nullable } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// INFO: Height of the menu bar region including vertical margins (2px mt + 24px segment + 8px py + 2px mb = 36px), matching --emoticon-menu-height in theme.css.
export const EMOTICON_MENU_HEIGHT = 36;

const SNAP_THRESHOLD = 0.5;
const FLICK_VELOCITY = 0.3; // px per ms for fast fling snap
const SETTLING_DURATION_MS = 220;

export type UseEmoticonMenuCollapseOptions = {
  activeTab?: string;
  isOpen?: boolean;
  isSearching?: boolean;
  isSheetDragging?: boolean;
  isSheetExpanded?: boolean;
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
  isSheetDragging = false,
  isSheetExpanded = false,
  menuHeight = EMOTICON_MENU_HEIGHT,
  scrollerRef,
}: UseEmoticonMenuCollapseOptions): EmoticonMenuCollapse {
  const [collapseOffset, setCollapseOffset] = useState(0);
  const [isSettling, setIsSettling] = useState(false);

  // INFO: When closed, searching, or expanded to full screen, always show the header without flickering.
  const isBypassed = !isOpen || isSearching || isSheetExpanded;
  const effectiveOffset = isBypassed ? 0 : collapseOffset;
  const isCollapsed = effectiveOffset >= menuHeight * 0.5;

  const [prevBypassed, setPrevBypassed] = useState(isBypassed);
  if (isBypassed !== prevBypassed) {
    setPrevBypassed(isBypassed);
    if (isBypassed) {
      setCollapseOffset(0);
    }
  }

  const collapseOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasScrolledAwayFromTopRef = useRef(false);
  const rafIdRef = useRef<Nullable<number>>(null);
  const settlingTimerRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);

  useEffect(() => {
    collapseOffsetRef.current = effectiveOffset;
    if (isBypassed) {
      hasScrolledAwayFromTopRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    }
  }, [effectiveOffset, isBypassed]);

  const settleTo = useCallback((target: number) => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    collapseOffsetRef.current = target;
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

  const expand = useCallback(() => {
    hasScrolledAwayFromTopRef.current = false;
    settleTo(0);
  }, [settleTo]);

  const collapse = useCallback(() => {
    settleTo(menuHeight);
  }, [settleTo, menuHeight]);

  // INFO: Mark data-menu-collapsed on the scroller so useSheetDrag does not mistake pulling down to expand the menu for pulling down the sheet to close it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }

    if (isCollapsed) {
      scroller.setAttribute("data-menu-collapsed", "true");
    } else {
      scroller.removeAttribute("data-menu-collapsed");
    }

    return () => {
      scroller.removeAttribute("data-menu-collapsed");
    };
  }, [isCollapsed, scrollerRef]);

  useEffect(() => {
    return () => {
      if (settlingTimerRef.current) {
        clearTimeout(settlingTimerRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !isOpen || isSearching || isSheetExpanded) {
      return;
    }

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

    const scheduleOffsetUpdate = (offset: number) => {
      collapseOffsetRef.current = offset;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      rafIdRef.current = requestAnimationFrame(() => {
        setCollapseOffset(offset);
        rafIdRef.current = null;
      });
    };

    const handleScroll = () => {
      if (isSheetDragging || isDraggingRef.current) {
        return;
      }

      const currentScrollTop = scroller.scrollTop;

      if (currentScrollTop > 20) {
        hasScrolledAwayFromTopRef.current = true;
      }

      // INFO: Hysteresis threshold to eliminate any flicker:
      // Re-expand when user scrolled into content and returned to top (<= 2px)
      if (currentScrollTop <= 2) {
        if (hasScrolledAwayFromTopRef.current && collapseOffsetRef.current > 0) {
          hasScrolledAwayFromTopRef.current = false;
          settleTo(0);
        }
      }
      // Collapse when scrolling down past top (> 30px)
      else if (currentScrollTop > 30) {
        if (collapseOffsetRef.current === 0) {
          settleTo(menuHeight);
        }
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isSheetDragging || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      setIsSettling(false);
      isDraggingRef.current = true;

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
      if (isSheetDragging) {
        return;
      }

      const gesture = gestureRef.current;
      if (!gesture || event.touches.length !== 1) {
        return;
      }

      // WARN: Only track header collapse if gesture started near top of grid.
      // Pulling from bottom to expand sheet to full-screen is handled by useSheetDrag.
      if (gesture.startScrollTop > 20) {
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

      // Dragging up (deltaY > 0) -> collapse
      if (deltaY > 0) {
        if (gesture.startOffset < menuHeight) {
          if (deltaY <= menuHeight) {
            // WARN: Cancel native scroll while menu bar is absorbing the travel to avoid 2x speed jump.
            if (event.cancelable) {
              event.preventDefault();
            }
            const next = Math.min(menuHeight, gesture.startOffset + deltaY);
            scheduleOffsetUpdate(next);
          } else {
            if (event.cancelable) {
              event.preventDefault();
            }
            scheduleOffsetUpdate(menuHeight);
            scroller.scrollTop = deltaY - (menuHeight - gesture.startOffset);
            if (scroller.scrollTop > 20) {
              hasScrolledAwayFromTopRef.current = true;
            }
          }
        }
      }
      // Dragging down (deltaY < 0) -> expand
      else if (deltaY < 0) {
        if (collapseOffsetRef.current > 0 && scroller.scrollTop <= 20) {
          if (event.cancelable) {
            event.preventDefault();
          }
          const next = Math.max(0, gesture.startOffset + deltaY);
          scheduleOffsetUpdate(next);
        }
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;

      if (isSheetDragging) {
        return;
      }

      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (!gesture || gesture.axis === "horizontal" || gesture.startScrollTop > 20) {
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
      if (isSheetDragging || Math.abs(event.deltaY) < 5) {
        return;
      }

      if (event.deltaY > 0 && collapseOffsetRef.current < menuHeight && scroller.scrollTop <= 20) {
        collapse();
      } else if (event.deltaY < 0 && collapseOffsetRef.current > 0 && scroller.scrollTop <= 2) {
        expand();
      }
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    scroller.addEventListener("touchstart", handleTouchStart, { passive: true });
    scroller.addEventListener("touchmove", handleTouchMove, { passive: false });
    scroller.addEventListener("touchend", handleTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    scroller.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      isDraggingRef.current = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      scroller.removeEventListener("scroll", handleScroll);
      scroller.removeEventListener("touchstart", handleTouchStart);
      scroller.removeEventListener("touchmove", handleTouchMove);
      scroller.removeEventListener("touchend", handleTouchEnd);
      scroller.removeEventListener("touchcancel", handleTouchEnd);
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, [
    activeTab,
    collapse,
    expand,
    isOpen,
    isSearching,
    isSheetDragging,
    isSheetExpanded,
    menuHeight,
    scrollerRef,
    settleTo,
  ]);

  return {
    collapse,
    collapseOffset: effectiveOffset,
    expand,
    isCollapsed,
    isSettling,
  };
}
