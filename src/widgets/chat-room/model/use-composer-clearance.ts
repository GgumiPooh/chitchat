"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { KEYBOARD_OVERLAID_ATTRIBUTE, type Nullable } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";

const CLEARANCE_PROPERTY = "--chat-composer-gap";
// WARN: The token and never `--viewport-settle-duration`, which is `0s` under two states — a `0s` transition fires no `transitionend`, and the frozen scroller would never be released.
const FLIP_TRANSITION = "transform var(--duration-keyboard-flip) var(--ease-route)";

// INFO: Subpixel slack only — anything wider would re-pin a user who has deliberately scrolled a little way up.
const BOTTOM_EPSILON = 1;

export type ComposerClearanceOptions = {
  containerRef: RefObject<Nullable<HTMLElement>>;
  composerRef: RefObject<Nullable<HTMLElement>>;
  /** The composer's own translated child — never `composerRef` itself, see its WARN — that a keyboard step's FLIP writes `transform` to directly. */
  composerMotionRef: RefObject<Nullable<HTMLElement>>;
  composerSpacerRef: RefObject<Nullable<HTMLElement>>;
  scrollerRef: RefObject<Nullable<HTMLElement>>;
  /** The list's absolutely-positioned rows wrapper (`virtualizer.getTotalSize()`'s own box), FLIPped during a keyboard step. */
  contentRef: RefObject<Nullable<HTMLElement>>;
  isAtBottomRef: RefObject<boolean>;
  /** True while the emoticon sheet's own drag owns `composerMotionRef`'s transform — a keyboard step must not fight it for the same element. */
  isDraggingRef: RefObject<boolean>;
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
 * `ChatScreen`'s height now lands in one shot, so the composer is inverted by this
 * frame's delta and eased back to `0` on `transform` alone, imperatively — no React
 * state, since a re-render per keyboard step is exactly the cost this hook exists to
 * remove. The list instead eases forward to a running cumulative target, since
 * freezing the scroller's height and re-pinning it below is what keeps its content
 * from having moved at all at the frame the step lands. Growth from typing moves the
 * composer with the container standing still, which is exactly what keeps the two
 * paths apart.
 */
export function useComposerClearance({
  containerRef,
  composerRef,
  composerMotionRef,
  composerSpacerRef,
  scrollerRef,
  contentRef,
  isAtBottomRef,
  isDraggingRef,
}: ComposerClearanceOptions): void {
  const clearanceRef = useRef(0);
  const spacerHeightRef = useRef(0);
  const scrollerHeightRef = useRef(0);
  const containerHeightRef = useRef<Nullable<number>>(null);
  const containerWidthRef = useRef<Nullable<number>>(null);
  const composerTopRef = useRef<Nullable<number>>(null);

  // INFO: Whether the composer's own FLIP is running — `readTranslateY` only makes sense mid-flight, since the first step's prior position is always `0`.
  const isComposerFlippingRef = useRef(false);
  // INFO: Whether the list's content wrapper is mid-FLIP, in which direction, and the running cumulative target of a shrink run — `null` once nothing is running.
  const listFlipRef = useRef<Nullable<{ isGrowth: boolean; target: number }>>(null);

  useEffect(() => {
    const container = containerRef.current;
    const composer = composerRef.current;

    if (!container || !composer) {
      return;
    }

    let isScheduled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(pointer: coarse)");

    const observer = new ResizeObserver(() => schedule(container, composer));

    observer.observe(container);
    observer.observe(composer);

    // INFO: The composer's spacer carries `--bottom-inset` (REQUIREMENTS.md § 13.6.), so the bar stack behind it resizes the observed wrapper rather than moving it.
    const overlay = document.getElementById(BOTTOM_OVERLAY_ID);

    if (overlay) {
      observer.observe(overlay);
    }

    return () => {
      isScheduled = false;
      observer.disconnect();
      finishListFlip({ pinToBottom: false });
    };

    // WARN: Deferred to a microtask on purpose. `BottomOverlay` publishes `--bottom-inset` from its own `ResizeObserver`, and the two callbacks land in the same batch — measuring inline reads whichever position the composer happened to be in when this one ran first. A microtask runs after all observers have fired but before the browser paints, eliminating the 1-frame stutter `requestAnimationFrame` caused.
    function schedule(container: HTMLElement, composer: HTMLElement) {
      if (isScheduled) {
        return;
      }

      isScheduled = true;
      queueMicrotask(() => {
        isScheduled = false;
        measure(container, composer);
      });
    }

    // WARN: The reader's input and never `scroll` — the room's own `pinToBottom` (a new message, a typing row) fires that too, and it must not tear a running FLIP down.
    function abortListFlipForReader() {
      finishListFlip({ pinToBottom: false });
    }

    function pinToBottom(scroller: HTMLElement) {
      // INFO: iOS Safari bug: when `scrollHeight` shrinks during a CSS transition, Safari clamps the internal `scrollTop` but fails to update the visual offset layer, leaving a huge void. Assigning the clamped value back is ignored as a no-op. Assigning `max - 1` first dirties the scroll offset and forces the compositor to repaint.
      const max = scroller.scrollHeight - scroller.clientHeight;

      if (scroller.scrollTop >= max) {
        scroller.scrollTop = max - 1;
      }

      scroller.scrollTop = scroller.scrollHeight;
    }

    function finishListFlip({ pinToBottom: shouldPin }: { pinToBottom: boolean }) {
      const content = contentRef.current;

      if (listFlipRef.current === null || content === null) {
        return;
      }

      listFlipRef.current = null;
      content.removeEventListener("transitionend", onListFlipTransitionEnd);
      content.removeEventListener("transitioncancel", onListFlipTransitionEnd);
      content.style.transition = "";
      content.style.transform = "";
      content.style.willChange = "";

      const scroller = scrollerRef.current;

      if (!scroller) {
        return;
      }

      scroller.removeEventListener("touchstart", abortListFlipForReader);
      scroller.removeEventListener("wheel", abortListFlipForReader);
      scroller.style.height = "";
      // WARN: Re-read here — nothing observes the scroller itself, so the next shrink step would otherwise freeze at whatever height the last run started from.
      scrollerHeightRef.current = scroller.getBoundingClientRect().height;

      if (shouldPin) {
        pinToBottom(scroller);
      }
    }

    function readTranslateY(element: HTMLElement): number {
      return new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
    }

    // WARN: The instant-jump-then-ease recipe — never a running CSS target like the list below. The composer's own layout position already snapped to its final spot the instant the container resized, so what needs hiding is that snap itself; the list's has not moved yet (see `stepListFlip`), so there is nothing there to invert.
    function stepComposerFlip(delta: number) {
      if (isDraggingRef.current) {
        return;
      }

      const motion = composerMotionRef.current;

      if (!motion) {
        return;
      }

      const isFirstStep = !isComposerFlippingRef.current;
      const priorOffset = isFirstStep ? 0 : readTranslateY(motion);
      const inverted = priorOffset - delta;

      isComposerFlippingRef.current = true;
      motion.style.willChange = "transform";
      motion.style.transition = "none";
      motion.style.transform = `translateY(${inverted}px)`;
      // WARN: Forces the inverted frame to actually commit before the transition below is armed — without it the browser can coalesce both writes into one recalculation and the ease never starts from anywhere.
      motion.getBoundingClientRect();
      motion.style.transition = FLIP_TRANSITION;
      motion.style.transform = "";

      if (isFirstStep) {
        motion.addEventListener("transitionend", onComposerFlipTransitionEnd);
        // INFO: A sheet drag or 검색 hiding the stack cancels the transition, and the inline transition must go with it or the drag eases behind the finger.
        motion.addEventListener("transitioncancel", onComposerFlipTransitionEnd);
      }
    }

    // WARN: `transitionend` bubbles, and the rows and the composer's trays run `transform` transitions of their own — matched on the target, or a bubble's press would end the FLIP with the box still mid-flight.
    function onComposerFlipTransitionEnd(event: TransitionEvent) {
      const motion = composerMotionRef.current;

      if (event.target !== motion || event.propertyName !== "transform" || !motion) {
        return;
      }

      isComposerFlippingRef.current = false;
      motion.removeEventListener("transitionend", onComposerFlipTransitionEnd);
      motion.removeEventListener("transitioncancel", onComposerFlipTransitionEnd);
      motion.style.transition = "";
      motion.style.transform = "";
      motion.style.willChange = "";
    }

    // WARN: A running CSS target, never an instant jump. The scroller is frozen at its pre-step height and re-pinned to its own bottom below, so the content has not visibly moved at the frame this runs — easing it forward to the cumulative delta is the whole of the motion, and the already-declared `transition` retargets on its own from wherever it currently sits.
    // WARN: Two recipes by direction, and they are not interchangeable. A shrink (keys rising) freezes the scroller at its pre-step height, so nothing has visibly moved and the content is eased *forward* to the cumulative delta. A growth (keys leaving) cannot be frozen — the browser has already clamped `scrollTop` at layout and the band the keys uncover would sit empty behind a short frozen box — so the final layout is committed at once, the pin restores the bottom, and the content is inverted and released, the composer's own recipe.
    function stepListFlip(delta: number, scroller: HTMLElement) {
      const content = contentRef.current;

      if (!content) {
        return;
      }

      const isGrowth = delta > 0;

      // INFO: A direction change mid-flight commits the running animation and starts clean — folding a grow into a frozen shrink has no single consistent geometry.
      if (listFlipRef.current !== null && listFlipRef.current.isGrowth !== isGrowth) {
        finishListFlip({ pinToBottom: isAtBottomRef.current });
      }

      const running = listFlipRef.current;

      if (isGrowth) {
        const priorOffset = running === null ? 0 : readTranslateY(content);

        listFlipRef.current = { isGrowth, target: 0 };

        if (isAtBottomRef.current) {
          pinToBottom(scroller);
        }

        if (running === null) {
          startListFlipRun(content, scroller);
        }

        content.style.transition = "none";
        content.style.transform = `translateY(${priorOffset + delta}px)`;
        // WARN: Forces the inverted frame to commit before the transition below is armed — coalesced into one recalculation, the ease never starts from anywhere.
        content.getBoundingClientRect();
        content.style.transition = FLIP_TRANSITION;
        content.style.transform = "translateY(0px)";

        return;
      }

      const target = (running?.target ?? 0) + delta;

      listFlipRef.current = { isGrowth, target };

      if (running === null) {
        scroller.style.height = `${scrollerHeightRef.current}px`;
      }

      if (isAtBottomRef.current) {
        pinToBottom(scroller);
      }

      if (running === null) {
        content.style.transition = FLIP_TRANSITION;
        startListFlipRun(content, scroller);
      }

      content.style.transform = `translateY(${target}px)`;
    }

    function startListFlipRun(content: HTMLElement, scroller: HTMLElement) {
      content.style.willChange = "transform";
      content.addEventListener("transitionend", onListFlipTransitionEnd);
      content.addEventListener("transitioncancel", onListFlipTransitionEnd);
      scroller.addEventListener("touchstart", abortListFlipForReader, { passive: true });
      scroller.addEventListener("wheel", abortListFlipForReader, { passive: true });
    }

    function onListFlipTransitionEnd(event: TransitionEvent) {
      if (event.target !== contentRef.current || event.propertyName !== "transform") {
        return;
      }

      finishListFlip({ pinToBottom: isAtBottomRef.current });
    }

    function measure(container: HTMLElement, composer: HTMLElement) {
      const scroller = scrollerRef.current;
      const { height: containerHeight, width: containerWidth } = container.getBoundingClientRect();
      const composerTop = composer.getBoundingClientRect().top;
      const priorContainerHeight = containerHeightRef.current;
      const priorComposerTop = composerTopRef.current;
      const topDelta = priorComposerTop === null ? 0 : composerTop - priorComposerTop;
      // INFO: A keyboard step moves the container's own height; the composer growing under typed text moves only the composer, with the container standing still.
      // WARN: Gated on a coarse pointer and an unchanged width — a desktop window dragged taller would freeze the scroller on every frame, and a rotation would FLIP a list being re-laid out under it.
      const isKeyboardStep =
        priorContainerHeight !== null &&
        containerHeight !== priorContainerHeight &&
        containerWidth === containerWidthRef.current &&
        topDelta !== 0 &&
        coarsePointer.matches;

      containerHeightRef.current = containerHeight;
      containerWidthRef.current = containerWidth;
      composerTopRef.current = composerTop;

      let didAnimateList = false;

      if (
        isKeyboardStep &&
        !document.documentElement.hasAttribute(KEYBOARD_OVERLAID_ATTRIBUTE) &&
        !reducedMotion.matches
      ) {
        stepComposerFlip(topDelta);

        if (scroller && isAtBottomRef.current) {
          stepListFlip(topDelta, scroller);
          didAnimateList = true;
        }
      }

      // INFO: The spacer's height comes out of the same reading it went into, so the two cancel whatever the animation has it at this frame.
      const spacerHeight = composerSpacerRef.current?.getBoundingClientRect().height ?? 0;
      const clearance = Math.max(
        container.getBoundingClientRect().bottom - composerTop - spacerHeight,
        0,
      );
      // INFO: The rect and not `clientHeight` — a scroller frozen mid-FLIP still reports its old value here, which is exactly what the next step's `stepListFlip` wants to freeze at again.
      const scrollerHeight = scroller?.getBoundingClientRect().height ?? 0;
      // WARN: REQUIREMENTS.md § 13.6. The spacer counts as the strip changing even though it is left out of the published value. Opening the panel with no keyboard up moves nothing else — the measurement holds still and so does the scroller — and tested on those two alone this loop returned on every frame of the ease and left `transitionend` to drag the history down in one step.
      const hasStripChanged =
        clearance !== clearanceRef.current || spacerHeight !== spacerHeightRef.current;

      if (!hasStripChanged && scrollerHeight === scrollerHeightRef.current) {
        return;
      }

      const distance = scroller
        ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
        : 0;
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

      // WARN: Only when the list FLIP actually started this step — reduced motion, `[data-keyboard-overlaid]`, and a keyboard step while scrolled away all fall through here instead, and still need the plain re-pin below.
      if (didAnimateList) {
        return;
      }

      // INFO: The trailing spacer is this frame's `--chat-composer-spacer` (REQUIREMENTS.md § 13.6.), so `scrollHeight` here already carries the growth the composer is showing and the newest message stays parked above it.
      if (scroller && isPinned) {
        pinToBottom(scroller);
      }
    }
  }, [
    containerRef,
    composerRef,
    composerMotionRef,
    composerSpacerRef,
    scrollerRef,
    contentRef,
    isAtBottomRef,
    isDraggingRef,
  ]);
}
