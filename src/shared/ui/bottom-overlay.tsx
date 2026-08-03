"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { useEffect, useRef, type PropsWithChildren } from "react";

const INSET_PROPERTY = "--bottom-inset";

export type BottomOverlayProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Holds the floating bars over the bottom of the shell (DESIGN.md § 3.5.) and
 * measures their total height into `--bottom-inset`, which the shell's scroller
 * takes as bottom padding so the last row can still clear them.
 */
export function BottomOverlay({ className, children }: BottomOverlayProps) {
  const overlayRef = useRef<Nullable<HTMLDivElement>>(null);

  // INFO: Measured rather than summed from the height tokens — the bars come and go with the keyboard, and the install banner's Korean copy wraps to two lines on a narrow viewport.
  useEffect(() => {
    const overlay = overlayRef.current;

    if (!overlay) {
      return;
    }

    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty(INSET_PROPERTY, `${overlay.offsetHeight}px`),
    );

    observer.observe(overlay);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(INSET_PROPERTY);
    };
  }, []);

  return (
    // WARN: Transparent to the pointer, so content scrolling underneath stays tappable. Every bar inside re-enables it on its own visible surface.
    <div
      ref={overlayRef}
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-30", className)}
      id={BOTTOM_OVERLAY_ID}
    >
      {children}
    </div>
  );
}
