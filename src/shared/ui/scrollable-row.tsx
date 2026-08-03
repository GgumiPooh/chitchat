"use client";

import { buildFadeMask, cn, useIsCoarsePointer, type Nullable } from "@/shared/lib";
import { isEqual } from "lodash-es";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { IconButton } from "./icon-button";

enum Direction {
  Previous = -1,
  Next = 1,
}

export type ScrollableRowProps = PropsWithChildren<{
  className?: string;
  scrollerClassName?: string;
  scrollStep?: "item" | "viewport";
  fade?: boolean;
}>;

export function ScrollableRow({
  className,
  scrollerClassName,
  scrollStep = "viewport",
  fade = false,
  children,
}: ScrollableRowProps) {
  const isCoarsePointer = useIsCoarsePointer();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [{ canScrollPrev, canScrollNext }, setOverflow] = useState({
    canScrollPrev: false,
    canScrollNext: false,
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    function update() {
      if (!el) {
        return;
      }

      const max = el.scrollWidth - el.clientWidth;
      const next = {
        canScrollPrev: el.scrollLeft > 1,
        canScrollNext: el.scrollLeft < max - 1,
      };

      setOverflow((current) => (isEqual(current, next) ? current : next));
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  // INFO: AGENTS.md § 4.2. Arrows are an interaction detail for pointer users, not a layout branch.
  const showArrows = !isCoarsePointer;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={scrollerRef}
        className={cn("scrollbar-hidden overflow-x-auto", scrollerClassName)}
        style={
          fade
            ? {
                maskImage: buildFadeMask({
                  direction: "to right",
                  fadeStart: canScrollPrev,
                  fadeEnd: canScrollNext,
                }),
              }
            : undefined
        }
      >
        {children}
      </div>
      {showArrows && canScrollPrev && (
        <IconButton
          className="absolute top-1/2 left-0 z-10 -translate-x-1/2 -translate-y-1/2 border border-hairline bg-canvas shadow-raised"
          Icon={ChevronLeft}
          aria-label="이전으로 스크롤"
          onClick={handleScroll(Direction.Previous)}
        />
      )}
      {showArrows && canScrollNext && (
        <IconButton
          className="absolute top-1/2 right-0 z-10 translate-x-1/2 -translate-y-1/2 border border-hairline bg-canvas shadow-raised"
          Icon={ChevronRight}
          aria-label="다음으로 스크롤"
          onClick={handleScroll(Direction.Next)}
        />
      )}
    </div>
  );

  function handleScroll(direction: Direction) {
    return () => {
      const el = scrollerRef.current;
      if (!el) {
        return;
      }

      const distance = scrollStep === "item" ? findItemPitch(el) : null;
      el.scrollBy({
        left: direction * (distance ?? el.clientWidth * 0.85),
        behavior: "smooth",
      });
    };
  }
}

function findItemPitch(scroller: HTMLDivElement): Nullable<number> {
  const [first, second] = Array.from(scroller.firstElementChild?.children ?? []);
  if (!first || !second) {
    return null;
  }

  const pitch = second.getBoundingClientRect().left - first.getBoundingClientRect().left;

  return pitch > 0 ? pitch : null;
}
