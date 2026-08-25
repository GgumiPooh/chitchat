"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";

const CLEARANCE_PROPERTY = "--chat-composer-gap";

// INFO: Subpixel slack only — anything wider would re-pin a user who has deliberately scrolled a little way up.
const BOTTOM_EPSILON = 1;

export type ComposerClearanceOptions = {
  containerRef: RefObject<Nullable<HTMLElement>>;
  composerRef: RefObject<Nullable<HTMLElement>>;
  composerSpacerRef: RefObject<Nullable<HTMLElement>>;
  scrollerRef: RefObject<Nullable<HTMLElement>>;
  isAtBottomRef: RefObject<boolean>;
};

/**
 * Publishes the part of the strip that the floating composer covers which no
 * stylesheet knows — everything above its spacer — as `--chat-composer-gap` on
 * the chat container, and keeps the newest message parked directly above the
 * composer while that part changes height. It moves often: the field auto-grows
 * per line (DESIGN.md § 6.6.) and the bars behind it come and go with the
 * keyboard (§ 7.3.).
 *
 * WARN: The spacer's own height is subtracted back out and left to
 * `--chat-composer-spacer` (REQUIREMENTS.md § 13.6.). Measured into this value it
 * was republished a frame at a time against a chat screen the browser was easing
 * on its own clock, and every frame the swap dropped landed as the history being
 * shoved and pinned back.
 *
 * WARN: It re-pins for a scroller that changed height too, not only for a
 * clearance that did. The keyboard is the one thing that shortens the history
 * without moving the composer inside it (DESIGN.md § 3.4.), and the two
 * animations it starts do not end together — so the tail of the shell's ease
 * would otherwise leave the newest message stranded below the fold.
 */
export function useComposerClearance({
  containerRef,
  composerRef,
  composerSpacerRef,
  scrollerRef,
  isAtBottomRef,
}: ComposerClearanceOptions) {
  const clearanceRef = useRef(0);
  const scrollerHeightRef = useRef(0);

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

    // INFO: The composer's spacer carries `--bottom-inset` (REQUIREMENTS.md § 13.6.), so the bar stack behind it resizes the observed wrapper rather than moving it.
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
      // INFO: The spacer's height comes out of the same reading it went into, so the two cancel whatever the animation has it at this frame.
      const spacerHeight = composerSpacerRef.current?.getBoundingClientRect().height ?? 0;
      const clearance = Math.max(
        container.getBoundingClientRect().bottom -
          composer.getBoundingClientRect().top -
          spacerHeight,
        0,
      );
      const scroller = scrollerRef.current;
      // INFO: The rect and not `clientHeight` — the shell eases its height (DESIGN.md § 3.4.), so most frames of a keyboard move it by a fraction of a pixel that the rounded property reports as no change at all.
      const scrollerHeight = scroller?.getBoundingClientRect().height ?? 0;
      const hasClearanceChanged = clearance !== clearanceRef.current;

      if (!hasClearanceChanged && scrollerHeight === scrollerHeightRef.current) {
        return;
      }

      const distance = scroller
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        : 0;
      // WARN: Read before the property below moves the spacer, and never from `isAtBottomRef` alone — the room publishes that flag from a render-scoped effect, which lands a frame or more after the spacer this loop is growing, so a mid-animation `false` would strand the rest of the animation with no re-pin at all.
      // WARN: The shrink branch cannot borrow that flag. It is `AT_BOTTOM_THRESHOLD` wide, and a height change is not always a keyboard — a rotation or a desktop window resize would throw a reader parked inside those 200px to the live edge, which is a scroll they never asked for and did not get before.
      // INFO: Subtracting the shrink is what leaves the tight test usable at all: the frame's own shrink is what opened the distance, so `distance − shrink` is where the reader stood before it.
      const isPinned =
        scroller !== null &&
        (hasClearanceChanged
          ? isAtBottomRef.current || distance <= BOTTOM_EPSILON
          : distance - (scrollerHeightRef.current - scrollerHeight) <= BOTTOM_EPSILON);

      clearanceRef.current = clearance;
      scrollerHeightRef.current = scrollerHeight;
      container.style.setProperty(CLEARANCE_PROPERTY, `${clearance}px`);

      // INFO: The property above drives the list's trailing spacer, so reading `scrollHeight` here already sees the new one and the newest message stays parked above the composer as it grows.
      if (scroller && isPinned) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }
  }, [containerRef, composerRef, composerSpacerRef, scrollerRef, isAtBottomRef]);
}
