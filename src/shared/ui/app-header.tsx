"use client";

import { cn } from "@/shared/lib";
import { useEffect, useState, type ReactNode } from "react";
import { Container } from "./container";

// INFO: A few pixels of WebKit rubber-banding should not count as having scrolled.
const SCROLLED_THRESHOLD = 8;

export type AppHeaderProps = {
  className?: string;
  titleClassName?: string;
  title?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

/**
 * The floating top strip (DESIGN.md § 7.12.). It has no surface of its own: it
 * is a transparent row pinned to the top of the visual viewport, and only the
 * controls inside it are visible. Content scrolls underneath.
 */
export function AppHeader({ className, titleClassName, title, leading, trailing }: AppHeaderProps) {
  const isScrolled = useIsScrolled();

  return (
    <header
      // WARN: `pointer-events-none` belongs on the root, not the row inside it — on the row the header's own box still swallows every tap on the content passing beneath it. Each control re-enables it for itself.
      className={cn(
        // WARN: DESIGN.md § 3.4. `fixed`, and it is the AGENTS.md § 4.4. argument `BottomOverlay` already carries — measured on the device, not chosen. A `sticky` strip pins to the top of the *layout* viewport, and WebKit pans that above the visual one to reveal a focused field: `offsetTop` 137 put this box at client −131, taking REQUIREMENTS.md § 8.6.'s search field off screen the moment its own keyboard opened. A `fixed` box lands inside the visual viewport instead, which is why the composer and the bars have always been right where this one was not.
        // WARN: The safe area and the float gap are this box's `top`, never padding inside it — padding still leaves the box bordering the obscured content inset, and iOS 26 Safari then paints a solid status bar instead of showing the page through it. Same reason `BottomOverlay` carries its lift on `bottom`.
        "pointer-events-none fixed inset-x-0 top-(--header-lift) z-30",
        className,
      )}
    >
      {/* INFO: DESIGN.md § 3.3. The shell width, re-applied for the same reason `BottomOverlay` re-applies it — the document moves under a `fixed` box, so it cannot inherit the column's centring. */}
      <Container className="flex h-(--app-header-height) items-center gap-2xs px-sm [&>*]:pointer-events-auto">
        {leading}
        {title ? (
          <h1
            // INFO: DESIGN.md § 7.12. The title has no surface of its own, so it fades out rather than collide with the content scrolling under it — the controls keep their floating fill and stay.
            // WARN: The faded title must drop `pointer-events`, which the row grants every child — invisible, it would still be a full-width block over the content it just made way for.
            className={cn(
              "flex-1 truncate px-2xs text-title-md text-ink transition-opacity duration-200 ease-out",
              isScrolled && "pointer-events-none opacity-0",
              titleClassName,
            )}
          >
            {title}
          </h1>
        ) : (
          // INFO: The spacer exists to push `trailing` to the far edge when there is no title to do it. A `leading` that came without a title is a caller filling the row itself (REQUIREMENTS.md § 8.6.'s search field), and a second flexible child beside it would halve the width it asked for.
          !leading && <div className="flex-1" />
        )}
        {trailing}
      </Container>
    </header>
  );
}

// INFO: DESIGN.md § 3.4. The document is the scroller. A screen with its own scroller (chat) therefore never reports scrolled, which is what its run-under-the-controls layout wants.
function useIsScrolled(): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const sync = () => setIsScrolled(window.scrollY > SCROLLED_THRESHOLD);

    // WARN: No sync on mount — arriving from a scrolled screen the router has not reset the document yet, so the fresh title would fade in and back out again. Its scroll-to-top and `ScrollMemory`'s restore both dispatch `scroll`.
    window.addEventListener("scroll", sync, { passive: true });

    return () => window.removeEventListener("scroll", sync);
  }, []);

  return isScrolled;
}
