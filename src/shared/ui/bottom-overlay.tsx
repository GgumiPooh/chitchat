"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { cn, useIsVirtualKeyboardOpen, type Nullable } from "@/shared/lib";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

const INSET_PROPERTY = "--bottom-inset";

export type BottomOverlayProps = PropsWithChildren<{
  className?: string;
  contentClassName?: string;
}>;

/**
 * Holds the floating bars over the bottom of the shell (DESIGN.md § 3.5.) and
 * measures their total height into `--bottom-inset`, which the shell's scroller
 * takes as bottom padding so the last row can still clear them. It is also the
 * one place the bars leave for the on-screen keyboard (§ 7.3.), so they go on a
 * single timeline instead of each dropping out of the tree on its own.
 */
export function BottomOverlay({ className, contentClassName, children }: BottomOverlayProps) {
  const overlayRef = useRef<Nullable<HTMLDivElement>>(null);
  const contentRef = useRef<Nullable<HTMLDivElement>>(null);
  const isKeyboardOpen = useIsVirtualKeyboardOpen();
  const [contentHeight, setContentHeight] = useState<Nullable<number>>(null);

  // INFO: Measured rather than summed from the height tokens — the bars come and go with the keyboard, and the install banner's Korean copy wraps to two lines on a narrow viewport.
  useEffect(() => {
    const overlay = overlayRef.current;
    const content = contentRef.current;

    if (!overlay || !content) {
      return;
    }

    // WARN: The inset comes off the collapsing box and the resting height off the bars inside it. Read the other way round the clearance would hold at full height while the bars are already on their way out, and the collapse would drive its own target to zero.
    const observer = new ResizeObserver(() => {
      setContentHeight(content.offsetHeight);
      document.documentElement.style.setProperty(INSET_PROPERTY, `${overlay.offsetHeight}px`);
    });

    observer.observe(overlay);
    observer.observe(content);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(INSET_PROPERTY);
    };
  }, []);

  return (
    // WARN: Transparent to the pointer, so content scrolling underneath stays tappable. Every bar inside re-enables it on its own visible surface.
    // INFO: DESIGN.md § 3.4. The height carries `--bottom-inset` with it, so the composer rides the collapse instead of stepping to its new offset the instant the keyboard is detected.
    <div
      ref={overlayRef}
      className={cn(
        // INFO: DESIGN.md § 4.7.1. A route change never touches this element — the screen animates inside the scroller and the bars simply stay put, blurring whatever slides underneath.
        "pointer-events-none absolute inset-x-0 bottom-0 z-30 transition-[height] ease-out",
        // WARN: DESIGN.md § 7.3. The bars only come back once the shell has finished easing to its resting height. Rising on the same frame the keyboard starts leaving draws them at the shell's bottom edge while that edge is still halfway up the screen, which reads as the tab bar appearing in mid-air.
        isKeyboardOpen ? "duration-200" : "delay-200 duration-150",
        className,
      )}
      // WARN: `undefined` until the first measurement lands, which leaves the height `auto`. A `0` placeholder would hide the bars until an effect has run, and the first transition would then play on load.
      style={{ height: isKeyboardOpen ? 0 : (contentHeight ?? undefined) }}
      // WARN: The bars stay mounted through the collapse so they have something to animate, which leaves their tab stops in the document until this takes them back out.
      inert={isKeyboardOpen}
      id={BOTTOM_OVERLAY_ID}
    >
      {/* WARN: Deliberately not clipped — the bars slide down past the shell's bottom edge, which is where the keyboard already is. Clipping would buy nothing and cut the pill's `shadow-floating` off at the collapsing edge. */}
      <div ref={contentRef} className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
