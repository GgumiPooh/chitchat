"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { KEYBOARD_OVERLAID_ATTRIBUTE, type Nullable, type Optional } from "@/shared/lib";
import { useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

const CLEARANCE_PROPERTY = "--chat-composer-gap";

// INFO: Subpixel slack only — anything wider would re-pin a user who has deliberately scrolled a little way up.
const BOTTOM_EPSILON = 1;

export type ComposerClearanceOptions = {
  containerRef: RefObject<Nullable<HTMLElement>>;
  composerRef: RefObject<Nullable<HTMLElement>>;
  composerSpacerRef: RefObject<Nullable<HTMLElement>>;
  scrollerRef: RefObject<Nullable<HTMLElement>>;
  /** The list's absolutely-positioned rows wrapper (`virtualizer.getTotalSize()`'s own box), FLIPped during a keyboard step. */
  contentRef: RefObject<Nullable<HTMLElement>>;
  isAtBottomRef: RefObject<boolean>;
};

export type ComposerClearance = {
  /** Applied to a child of `composerRef` — never that box itself, see its own WARN — and to whatever else rides with it (the scroll-to-bottom pill). */
  flipTranslateY: number;
  /** True for the one frame the FLIP's inverted position is painted, forcing that transform's own transition off so the jump has nothing to ease. */
  isFlipping: boolean;
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
 * WARN: A keyboard step — the container's own height moving, never the composer
 * growing on its own — takes the FLIP path below instead of the per-frame re-pin.
 * `ChatScreen`'s height now lands in one shot, so the composer and the list's
 * content wrapper are inverted by this frame's delta and eased back to `0` on
 * `transform` alone, which costs no layout; the scroller's own height is held at
 * what it was until that ease ends, so nothing mid-animation asks the browser to
 * clamp `scrollTop` for us. Growth from typing moves the composer with the
 * container standing still, which is exactly what keeps the two paths apart.
 */
export function useComposerClearance({
  containerRef,
  composerRef,
  composerSpacerRef,
  scrollerRef,
  contentRef,
  isAtBottomRef,
}: ComposerClearanceOptions): ComposerClearance {
  const clearanceRef = useRef(0);
  const spacerHeightRef = useRef(0);
  const scrollerHeightRef = useRef(0);
  const containerHeightRef = useRef<Nullable<number>>(null);
  const composerTopRef = useRef<Nullable<number>>(null);

  const [flipTranslateY, setFlipTranslateY] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const flipTranslateYRef = useRef(0);
  const flipFrameRef = useRef<Optional<number>>(undefined);

  // INFO: Whether the list's content wrapper is mid-FLIP and how tall the scroller is frozen at — `null` once nothing is running.
  const listFlipRef = useRef<Nullable<{ frozenHeight: number }>>(null);

  useEffect(() => {
    const container = containerRef.current;
    const composer = composerRef.current;
    const scroller = scrollerRef.current;

    if (!container || !composer || !scroller) {
      return;
    }

    let isScheduled = false;

    const observer = new ResizeObserver(() => schedule(container, composer, scroller));

    observer.observe(container);
    observer.observe(composer);

    // INFO: The composer's spacer carries `--bottom-inset` (REQUIREMENTS.md § 13.6.), so the bar stack behind it resizes the observed wrapper rather than moving it.
    const overlay = document.getElementById(BOTTOM_OVERLAY_ID);

    if (overlay) {
      observer.observe(overlay);
    }

    // WARN: A scroll while the list is mid-FLIP is read as the reader taking the scroller back — the animation is torn down on the spot rather than fought at its next frame.
    scroller.addEventListener("scroll", abortListFlipOnUserScroll);

    return () => {
      isScheduled = false;
      observer.disconnect();
      scroller.removeEventListener("scroll", abortListFlipOnUserScroll);
      cancelAnimationFrame(flipFrameRef.current ?? -1);
    };

    // WARN: Deferred to a microtask on purpose. `BottomOverlay` publishes `--bottom-inset` from its own `ResizeObserver`, and the two callbacks land in the same batch — measuring inline reads whichever position the composer happened to be in when this one ran first. A microtask runs after all observers have fired but before the browser paints, eliminating the 1-frame stutter `requestAnimationFrame` caused.
    function schedule(container: HTMLElement, composer: HTMLElement, scroller: HTMLElement) {
      if (isScheduled) {
        return;
      }

      isScheduled = true;
      queueMicrotask(() => {
        isScheduled = false;
        measure(container, composer, scroller);
      });
    }

    function abortListFlipOnUserScroll() {
      // INFO: The commit below nulls this out before it ever touches `scrollTop`, so the event that write dispatches is a no-op here.
      if (listFlipRef.current === null) {
        return;
      }

      finishListFlip({ pinToBottom: false });
    }

    function finishListFlip({ pinToBottom }: { pinToBottom: boolean }) {
      const content = contentRef.current;

      if (listFlipRef.current === null || content === null) {
        return;
      }

      listFlipRef.current = null;
      content.style.transition = "";
      content.style.transform = "";

      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      scroller.style.height = "";

      if (pinToBottom) {
        // INFO: iOS Safari bug: when `scrollHeight` shrinks during a CSS transition, Safari clamps the internal `scrollTop` but fails to update the visual offset layer, leaving a huge void. Assigning the clamped value back is ignored as a no-op. Assigning `max - 1` first dirties the scroll offset and forces the compositor to repaint.
        const max = scroller.scrollHeight - scroller.clientHeight;

        if (scroller.scrollTop >= max) {
          scroller.scrollTop = max - 1;
        }

        scroller.scrollTop = scroller.scrollHeight;
      }
    }

    function readTranslateY(element: HTMLElement): number {
      return new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
    }

    function stepComposerFlip(delta: number) {
      cancelAnimationFrame(flipFrameRef.current ?? -1);

      const inverted = flipTranslateYRef.current - delta;

      flipTranslateYRef.current = inverted;
      flushSync(() => {
        setIsFlipping(true);
        setFlipTranslateY(inverted);
      });

      flipFrameRef.current = requestAnimationFrame(() => {
        flipTranslateYRef.current = 0;
        flushSync(() => {
          setIsFlipping(false);
          setFlipTranslateY(0);
        });
      });
    }

    function stepListFlip(delta: number, frozenHeight: number, scroller: HTMLElement) {
      const content = contentRef.current;

      if (!content) {
        return;
      }

      const isFirstStep = listFlipRef.current === null;
      const priorOffset = isFirstStep ? 0 : readTranslateY(content);
      const inverted = priorOffset - delta;

      listFlipRef.current = { frozenHeight };
      scroller.style.height = `${frozenHeight}px`;
      content.style.transition = "none";
      content.style.transform = `translateY(${inverted}px)`;
      // WARN: Forces the inverted frame to actually paint before the transition below is armed — without it the browser can coalesce both writes into one recalculation and the ease never starts from anywhere.
      content.getBoundingClientRect();
      content.style.transition = "transform 300ms var(--ease-route)";
      content.style.transform = "translateY(0)";

      // WARN: Only on the first step of a run — a mid-flight retarget keeps the transition running rather than replacing it, so one listener sees it settle however many times this folded a new delta in.
      if (isFirstStep) {
        content.addEventListener("transitionend", onListFlipTransitionEnd, { once: true });
      }
    }

    function onListFlipTransitionEnd(event: TransitionEvent) {
      if (event.propertyName !== "transform") {
        return;
      }

      finishListFlip({ pinToBottom: isAtBottomRef.current });
    }

    function measure(container: HTMLElement, composer: HTMLElement, scroller: HTMLElement) {
      const containerHeight = container.getBoundingClientRect().height;
      const composerTop = composer.getBoundingClientRect().top;
      const priorContainerHeight = containerHeightRef.current;
      const priorComposerTop = composerTopRef.current;
      const topDelta = priorComposerTop === null ? 0 : composerTop - priorComposerTop;
      // INFO: A keyboard step moves the container's own height; the composer growing under typed text moves only the composer, with the container standing still.
      const isKeyboardStep =
        priorContainerHeight !== null && containerHeight !== priorContainerHeight && topDelta !== 0;

      containerHeightRef.current = containerHeight;
      composerTopRef.current = composerTop;

      if (
        isKeyboardStep &&
        !document.documentElement.hasAttribute(KEYBOARD_OVERLAID_ATTRIBUTE) &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        stepComposerFlip(topDelta);

        if (isAtBottomRef.current) {
          stepListFlip(
            topDelta,
            listFlipRef.current?.frozenHeight ?? scrollerHeightRef.current,
            scroller,
          );
        }
      }

      // INFO: The spacer's height comes out of the same reading it went into, so the two cancel whatever the animation has it at this frame.
      const spacerHeight = composerSpacerRef.current?.getBoundingClientRect().height ?? 0;
      const clearance = Math.max(
        container.getBoundingClientRect().bottom - composerTop - spacerHeight,
        0,
      );
      // INFO: The rect and not `clientHeight` — a scroller frozen mid-FLIP still reports its old value here, which is exactly what the next frame's `stepListFlip` wants to freeze at again.
      const scrollerHeight = scroller.getBoundingClientRect().height;
      // WARN: REQUIREMENTS.md § 13.6. The spacer counts as the strip changing even though it is left out of the published value. Opening the panel with no keyboard up moves nothing else — the measurement holds still and so does the scroller — and tested on those two alone this loop returned on every frame of the ease and left `transitionend` to drag the history down in one step.
      const hasStripChanged =
        clearance !== clearanceRef.current || spacerHeight !== spacerHeightRef.current;

      if (!hasStripChanged && scrollerHeight === scrollerHeightRef.current) {
        return;
      }

      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      // WARN: Read before the property below moves the spacer, and never from `isAtBottomRef` alone — the room publishes that flag from a render-scoped effect, which lands a frame or more after the spacer this loop is growing, so a mid-animation `false` would strand the rest of the animation with no re-pin at all.
      // WARN: The shrink branch cannot borrow that flag. It is `AT_BOTTOM_THRESHOLD` wide, and a height change is not always a keyboard — a rotation or a desktop window resize would throw a reader parked inside those 200px to the live edge, which is a scroll they never asked for and did not get before.
      // INFO: Subtracting the shrink is what leaves the tight test usable at all: the frame's own shrink is what opened the distance, so `distance − shrink` is where the reader stood before it.
      const isPinned = hasStripChanged
        ? isAtBottomRef.current || distance <= BOTTOM_EPSILON
        : distance - (scrollerHeightRef.current - scrollerHeight) <= BOTTOM_EPSILON;

      // INFO: Only when it moved — the strip's own frames publish the same number, and a property write is a style invalidation whether or not the value differs.
      if (clearance !== clearanceRef.current) {
        container.style.setProperty(CLEARANCE_PROPERTY, `${clearance}px`);
      }

      clearanceRef.current = clearance;
      spacerHeightRef.current = spacerHeight;
      scrollerHeightRef.current = scrollerHeight;

      // WARN: A keyboard step's pin is the list FLIP's own commit above, at its `transitionend` — re-pinning here too would fight that animation's frozen height with a `scrollTop` read off it.
      if (isKeyboardStep) {
        return;
      }

      // INFO: The trailing spacer is this frame's `--chat-composer-spacer` (REQUIREMENTS.md § 13.6.), so `scrollHeight` here already carries the growth the composer is showing and the newest message stays parked above it.
      if (isPinned) {
        // INFO: iOS Safari bug: when `scrollHeight` shrinks during a CSS transition (like the panel closing), Safari clamps the internal `scrollTop` but fails to update the visual offset layer, leaving a huge void. Assigning the clamped value back is ignored as a no-op. Assigning `max - 1` first dirties the scroll offset and forces the compositor to repaint.
        const max = scroller.scrollHeight - scroller.clientHeight;
        if (scroller.scrollTop >= max) {
          scroller.scrollTop = max - 1;
        }
        scroller.scrollTop = scroller.scrollHeight;
      }
    }
  }, [containerRef, composerRef, composerSpacerRef, scrollerRef, contentRef, isAtBottomRef]);

  return { flipTranslateY, isFlipping };
}
