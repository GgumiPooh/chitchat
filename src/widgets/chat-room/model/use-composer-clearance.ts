"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";

const CLEARANCE_PROPERTY = "--chat-bottom-gap";

export type ComposerClearanceOptions = {
  containerRef: RefObject<Nullable<HTMLElement>>;
  composerRef: RefObject<Nullable<HTMLElement>>;
  scrollerRef: RefObject<Nullable<HTMLElement>>;
  isAtBottomRef: RefObject<boolean>;
};

/**
 * Publishes the strip that the floating composer and bars cover as
 * `--chat-bottom-gap` on the chat container, and keeps the newest message
 * parked directly above the composer while that strip changes height. It moves
 * often: the field auto-grows per line (DESIGN.md § 6.6.) and the bars behind it
 * come and go with the keyboard (§ 7.3.).
 */
export function useComposerClearance({
  containerRef,
  composerRef,
  scrollerRef,
  isAtBottomRef,
}: ComposerClearanceOptions) {
  const clearanceRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    const composer = composerRef.current;

    if (!container || !composer) {
      return;
    }

    let frame = 0;

    const observer = new ResizeObserver(() => schedule(container, composer));

    observer.observe(container);
    observer.observe(composer);

    // INFO: The composer is anchored to `--bottom-inset`, so the bar stack behind it moves it without ever resizing it.
    const overlay = document.getElementById(BOTTOM_OVERLAY_ID);

    if (overlay) {
      observer.observe(overlay);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };

    // WARN: Deferred a frame on purpose. `BottomOverlay` publishes `--bottom-inset` from its own `ResizeObserver`, and the two callbacks land in the same batch — measuring inline reads whichever position the composer happened to be in when this one ran first.
    function schedule(container: HTMLElement, composer: HTMLElement) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(container, composer));
    }

    function measure(container: HTMLElement, composer: HTMLElement) {
      const clearance = Math.max(
        container.getBoundingClientRect().bottom - composer.getBoundingClientRect().top,
        0,
      );

      if (clearance === clearanceRef.current) {
        return;
      }

      clearanceRef.current = clearance;
      container.style.setProperty(CLEARANCE_PROPERTY, `${clearance}px`);

      const scroller = scrollerRef.current;

      // INFO: The property above drives the list's trailing spacer, so reading `scrollHeight` here already sees the new one and the newest message stays parked above the composer as it grows.
      if (scroller && isAtBottomRef.current) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }
  }, [containerRef, composerRef, scrollerRef, isAtBottomRef]);
}
