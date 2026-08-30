"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { cn, useIsVirtualKeyboardOpen, type Nullable } from "@/shared/lib";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Container } from "./container";

const INSET_PROPERTY = "--bottom-inset";
const KEYBOARD_ATTRIBUTE = "data-keyboard-open";

export type BottomOverlayProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Holds the floating bars over the bottom of the shell (DESIGN.md § 3.5.) and
 * measures their total height into `--bottom-inset`, which `RouteTransition`
 * trails as a spacer so the last row can still clear them. It is also the
 * one place the bars leave for the on-screen keyboard (§ 7.3.), so they go on a
 * single timeline instead of each dropping out of the tree on its own.
 */
export function BottomOverlay({ className, children }: BottomOverlayProps) {
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
      // INFO: The lift is the box's `bottom` rather than padding inside it, so the clearance is the height plus that offset — carried through as `--bar-lift` rather than read back, since resolving it here would force a layout inside the observer and freeze `env(safe-area-inset-bottom)` at the moment it ran.
      document.documentElement.style.setProperty(
        INSET_PROPERTY,
        `calc(${overlay.offsetHeight}px + var(--bar-lift))`,
      );
    });

    observer.observe(overlay);
    observer.observe(content);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(INSET_PROPERTY);
    };
  }, []);

  // INFO: DESIGN.md § 3.5. Published from here because this is already the one place the keyboard is decided (§ 7.3.); `theme.css` reads it back to drop the home-indicator inset from `--bar-lift`.
  useEffect(() => {
    if (!isKeyboardOpen) {
      return;
    }

    const root = document.documentElement;

    root.setAttribute(KEYBOARD_ATTRIBUTE, "");

    return () => {
      root.removeAttribute(KEYBOARD_ATTRIBUTE);
    };
  }, [isKeyboardOpen]);

  return (
    // WARN: Transparent to the pointer, so content scrolling underneath stays tappable. Every bar inside re-enables it on its own visible surface.
    // INFO: DESIGN.md § 3.4. The height carries `--bottom-inset` with it, so every bottom-anchored row rides the collapse instead of stepping the instant the keyboard is detected.
    // WARN: DESIGN.md § 7.3. 채팅 is not one of them — the room overrides the inset locally, so nothing here times the chat composer.
    <div
      ref={overlayRef}
      className={cn(
        // INFO: DESIGN.md § 4.7.1. A route change never touches this element — the screen animates underneath and the bars simply stay put, blurring whatever slides past.
        // WARN: DESIGN.md § 3.3. `fixed`, and it re-applies the shell width itself — the document is the scroller now, so an `absolute` bar would ride to the bottom of the page instead of staying on screen.
        // WARN: The float gap and the home-indicator inset are this box's `bottom`, never padding inside it — padding still leaves the box itself bordering the obscured content inset, which is what makes iOS 26 Safari paint its toolbar opaque instead of showing the page through it.
        // INFO: AGENTS.md § 4.4. `left-(--rail-width)` rather than `inset-x-0`, for the reason `AppHeader` carries the same change.
        "pointer-events-none fixed right-0 bottom-(--bar-lift) left-(--rail-width) z-30 transition-[height] ease-out",
        // WARN: DESIGN.md § 7.3. The bars wait the keyboard out rather than growing back with it. This box is `fixed` to the layout viewport, which Chromium's `interactive-widget=resizes-content` is still expanding for the whole of that animation — rising on the same frame draws the tab bar partway up the screen, which reads as it appearing in mid-air.
        isKeyboardOpen ? "duration-300" : "delay-300 duration-150",
        className,
      )}
      // WARN: `undefined` until the first measurement lands, which leaves the height `auto`. A `0` placeholder would hide the bars until an effect has run, and the first transition would then play on load.
      style={{ height: isKeyboardOpen ? 0 : (contentHeight ?? undefined) }}
      // WARN: The bars stay mounted through the collapse so they have something to animate, which leaves their tab stops in the document until this takes them back out.
      inert={isKeyboardOpen}
      id={BOTTOM_OVERLAY_ID}
    >
      {/* WARN: Deliberately not clipped — the bars slide down past this box's own bottom edge, which is where the keyboard already is. Clipping would buy nothing and cut the install banner's `shadow-floating` off at the collapsing edge. */}
      <Container className="px-0">
        <div ref={contentRef}>{children}</div>
      </Container>
    </div>
  );
}
