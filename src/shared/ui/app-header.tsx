"use client";

import { APP_SCROLL_ID } from "@/shared/config";
import { cn } from "@/shared/lib";
import { useEffect, useState, type ReactNode } from "react";

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
      // INFO: DESIGN.md § 7.12. The negative margin cancels its own height, so it takes no room in the column and the screen below starts at the top of the shell.
      // WARN: `pointer-events-none` belongs on the root, not the row inside it — on the row the header's own box still swallows every tap on the content passing beneath it. Each control re-enables it for itself.
      className={cn(
        "pointer-events-none sticky top-0 z-30 -mb-(--app-header-inset) pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="flex h-(--app-header-height) items-center gap-2xs px-sm [&>*]:pointer-events-auto">
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
      </div>
    </header>
  );
}

// INFO: The shell's scroller (DESIGN.md § 3.4.), never the document — it cannot scroll. A screen with its own scroller (chat) therefore never reports scrolled, which is what its run-under-the-controls layout wants.
function useIsScrolled(): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const scroller = document.getElementById(APP_SCROLL_ID);

    if (!scroller) {
      return;
    }

    const sync = () => setIsScrolled(scroller.scrollTop > SCROLLED_THRESHOLD);

    // WARN: No sync on mount — arriving from a scrolled screen the router has not reset the scroller yet, so the fresh title would fade in and back out again. Its scroll-to-top and `ScrollMemory`'s restore both dispatch `scroll`.
    scroller.addEventListener("scroll", sync, { passive: true });

    return () => scroller.removeEventListener("scroll", sync);
  }, []);

  return isScrolled;
}
