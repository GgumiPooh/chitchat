"use client";

import { APP_HEADER_ID } from "@/shared/config";
import { cn } from "@/shared/lib";
import { useEffect, useState, type ReactNode } from "react";
import { Container } from "./container";
import { SidePanelToggle } from "./side-panel-toggle";

// INFO: A few pixels of WebKit rubber-banding should not count as having scrolled.
const SCROLLED_THRESHOLD = 8;

export type AppHeaderProps = {
  className?: string;
  containerClassName?: string;
  titleClassName?: string;
  title?: string;
  leading?: ReactNode;
  /**
   * Set `true` when `leading` is a flex-growing element (e.g. a search field)
   * that fills the row itself. The header then omits its own spacer so the two
   * `flex-1` children don't split the available width in half.
   *
   * INFO: Defaults to `false` — an icon button in `leading` is not a row filler,
   * and the spacer is still needed to push `trailing` to the far edge.
   */
  leadingFills?: boolean;
  trailing?: ReactNode;
  /**
   * AGENTS.md § 4.1. Whether this screen has an `lg` `TwoPane` panel
   * to collapse — `SidePanelToggle` only draws where one exists. 채팅, 캘린더 and
   * 보관함's three shelves pass `true`; every panel-less screen (설정 and its
   * sub-routes included) leaves the default.
   */
  hasSidePanel?: boolean;
};

/**
 * The floating top strip (DESIGN.md § 7.12.). It has no surface of its own: it
 * is a transparent row pinned to the top of the visual viewport, and only the
 * controls inside it are visible. Content scrolls underneath.
 */
export function AppHeader({
  className,
  containerClassName,
  titleClassName,
  title,
  leading,
  leadingFills = false,
  trailing,
  hasSidePanel = false,
}: AppHeaderProps) {
  const isScrolled = useIsScrolled();

  return (
    <header
      // WARN: `pointer-events-none` belongs on the root, not the row inside it — on the row the header's own box still swallows every tap on the content passing beneath it. Each control re-enables it for itself.
      className={cn(
        // WARN: DESIGN.md § 3.4. `fixed`, and it is the AGENTS.md § 4.4. argument `BottomOverlay` already carries — measured on the device, not chosen. A `sticky` strip pins to the top of the *layout* viewport, and WebKit pans that above the visual one to reveal a focused field: `offsetTop` 137 put this box at client −131, taking REQUIREMENTS.md § 8.6.'s search field off screen the moment its own keyboard opened. A `fixed` box lands inside the visual viewport instead, which is why the composer and the bars have always been right where this one was not.
        // WARN: The safe area and the float gap are this box's `top`, never padding inside it — padding still leaves the box bordering the obscured content inset, and iOS 26 Safari then paints a solid status bar instead of showing the page through it. Same reason `BottomOverlay` carries its lift on `bottom`.
        // INFO: AGENTS.md § 4.4. `left-(--rail-width)` rather than `inset-x-0` — the rail is a fifth `fixed` element sitting left of every screen at `md`, and `--rail-width` is `0px` below it so this needs no `md:` variant.
        "pointer-events-none fixed top-(--header-lift) right-0 left-(--rail-width) z-30",
        className,
      )}
      id={APP_HEADER_ID}
    >
      {/* INFO: DESIGN.md § 3.3. The shell width, re-applied for the same reason `BottomOverlay` re-applies it — the document moves under a `fixed` box, so it cannot inherit the column's centring. */}
      {/* WARN: DESIGN.md § 7.12. `:not([data-inert])`, and the exclusion is the whole of it. The row used to grant `pointer-events-auto` to **every** direct child, which handed it to the two that fill the row and paint nothing — the `flex-1` title and the `flex-1` spacer — so the entire left and centre of the strip swallowed taps aimed at the content scrolling under a header that is deliberately transparent (§ 7.12.). Only what a finger can actually aim at may take pointers back. */}
      <Container
        className={cn(
          "flex h-(--app-header-height) items-center gap-2xs px-sm [&>*:not([data-inert])]:pointer-events-auto",
          containerClassName,
        )}
      >
        {hasSidePanel && <SidePanelToggle />}
        {leading}
        {title ? (
          <h1
            className={cn(
              "pointer-events-none flex-1 truncate px-2xs text-title-md text-ink transition-opacity duration-200 ease-out",
              isScrolled && "opacity-0",
              titleClassName,
            )}
            // INFO: DESIGN.md § 7.12. The title has no surface of its own, so it fades out rather than collide with the content scrolling under it — the controls keep their floating fill and stay.
            // WARN: `data-inert` at all times, not only once faded, which is what the row's own selector reads. It is a `flex-1` block spanning everything between the two control groups, so tappable it takes every tap on the content beneath the middle of the strip — the state before the fade is no different from the state after it, except that the reader can see what they are failing to reach.
            data-inert
          >
            {title}
          </h1>
        ) : (
          // INFO: The spacer pushes `trailing` to the far edge. When `leadingFills` is true the `leading` element is itself flex-growing (e.g. REQUIREMENTS.md § 8.6.'s search field) and adding a second `flex-1` child would halve the width it asked for — so the caller opts out via `leadingFills`.
          // WARN: `data-inert` for the title's reason and more plainly: it paints nothing at all, so every tap it takes is one the reader has no way to explain.
          !leadingFills && <div className="flex-1" data-inert />
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
    let settled = 0;

    // WARN: Two frames, and neither none nor one. `ScrollMemory` restores the position in a frame of its own, so a header that never syncs on mount misses it entirely — which is exactly what a screen streaming in behind `loading.tsx` does, since its own header mounts after that restore has already dispatched its `scroll`. Reading immediately is the other failure: the App Router has not reset the document yet, so the fresh title would start faded and fade back in.
    const restore = requestAnimationFrame(() => {
      settled = requestAnimationFrame(sync);
    });

    window.addEventListener("scroll", sync, { passive: true });

    return () => {
      cancelAnimationFrame(restore);
      cancelAnimationFrame(settled);
      window.removeEventListener("scroll", sync);
    };
  }, []);

  return isScrolled;
}
