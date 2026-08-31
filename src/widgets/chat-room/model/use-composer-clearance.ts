"use client";

import { BOTTOM_OVERLAY_ID } from "@/shared/config";
import { KEYBOARD_OVERLAID_ATTRIBUTE, type Nullable, type Optional } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";

const CLEARANCE_PROPERTY = "--chat-composer-gap";

// INFO: Console tracing for the FLIP work, armed by `localStorage["jandh:flipdebug"]` — inert otherwise and removed once the iPhone-only reports are closed.
function debugLog(tag: string, data: Record<string, unknown>): void {
  try {
    if (localStorage.getItem("jandh:flipdebug") !== "1") {
      return;
    }
  } catch {
    return;
  }

  console.log(
    `FLIP ${(performance.now() / 1000).toFixed(2)} ${tag}`,
    Object.entries(data)
      .map(([k, v]) => `${k}=${typeof v === "number" ? Math.round(v * 10) / 10 : String(v)}`)
      .join(" "),
  );
}
// WARN: The token and never `--viewport-settle-duration`, which is `0s` under two states — a `0s` transition fires no `transitionend`, and the frozen scroller would never be released.
const FLIP_TRANSITION = "transform var(--duration-keyboard-flip) var(--ease-route)";

// INFO: REQUIREMENTS.md § 13.6. The room's one-shot signal for the emoticon-panel toggle with no keyboard up — it moves the composer's own top with the container's height unchanged, the opposite of `isKeyboardStep`'s signature below, so the step is told apart by this rather than inferred.
export const SHEET_FLIP_ATTRIBUTE = "data-sheet-flip";
// INFO: The attribute's value when a drag already carried the composer to its final spot — the step then animates the list alone, since inverting the composer would replay the trip from its pre-drag top.
export const SHEET_FLIP_LIST_ONLY = "list-only";

// INFO: Subpixel slack only — anything wider would re-pin a user who has deliberately scrolled a little way up.
const BOTTOM_EPSILON = 1;
// INFO: The reconstruction below subtracts a step made of fractional lengths from a fractional scroll position, so it carries one more pixel of slack than the resting test.
const STEP_EPSILON = 2;

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
 *
 * WARN: § 13.6.'s emoticon-panel toggle with no keyboard up is a second FLIP source,
 * told apart by `SHEET_FLIP_ATTRIBUTE` rather than by this heuristic — it moves the
 * composer's own top exactly like a keyboard step, but leaves the container's height
 * untouched, which the heuristic above reads as typing growth. The room's own spacer
 * value snaps rather than eases for this case (`chat-room.tsx`), so the same
 * invert-and-release recipe runs off one resize instead of the CSS animation's every frame.
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
  // WARN: The release is armed a frame after the inversion, never in the same style flush — WebKit takes no style-change event from a forced layout, so armed inline it reads before-change and release as one value and starts no transition: the inversion then sits and cancels the pin, which painted as the sheet opening with the list never following.
  const composerReleaseFrameRef = useRef<Optional<number>>(undefined);
  const listReleaseFrameRef = useRef<Optional<number>>(undefined);
  // INFO: Whether the list's content wrapper is mid-FLIP, on which recipe, and the running cumulative target of a frozen run — `null` once nothing is running.
  const listFlipRef = useRef<
    Nullable<{
      usesFreeze: boolean;
      naturalHeight: number;
      frozenScrollTop: number;
      isPinned: boolean;
    }>
  >(null);

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
      cancelAnimationFrame(composerReleaseFrameRef.current ?? -1);
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

      debugLog("finishList", { pin: shouldPin });
      listFlipRef.current = null;
      cancelAnimationFrame(listReleaseFrameRef.current ?? -1);
      listReleaseFrameRef.current = undefined;
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
      // INFO: The inverted frame paints once before the release — it is the position the reader was already looking at, so nothing visibly changes.
      cancelAnimationFrame(composerReleaseFrameRef.current ?? -1);
      composerReleaseFrameRef.current = requestAnimationFrame(() => {
        composerReleaseFrameRef.current = undefined;
        motion.style.transition = FLIP_TRANSITION;
        motion.style.transform = "";
      });

      if (isFirstStep) {
        motion.addEventListener("transitionend", onComposerFlipTransitionEnd);
        // INFO: A sheet drag or 검색 hiding the stack cancels the transition, and the inline transition must go with it or the drag eases behind the finger.
        motion.addEventListener("transitioncancel", onComposerFlipTransitionEnd);
      }
    }

    function finishComposerFlip() {
      isComposerFlippingRef.current = false;
      cancelAnimationFrame(composerReleaseFrameRef.current ?? -1);
      composerReleaseFrameRef.current = undefined;

      const motion = composerMotionRef.current;

      if (!motion) {
        return;
      }

      motion.removeEventListener("transitionend", onComposerFlipTransitionEnd);
      motion.removeEventListener("transitioncancel", onComposerFlipTransitionEnd);
      motion.style.transition = "";
      motion.style.transform = "";
      motion.style.willChange = "";
    }

    // WARN: `transitionend` bubbles, and the rows and the composer's trays run `transform` transitions of their own — matched on the target, or a bubble's press would end the FLIP with the box still mid-flight.
    function onComposerFlipTransitionEnd(event: TransitionEvent) {
      if (event.target !== composerMotionRef.current || event.propertyName !== "transform") {
        return;
      }

      finishComposerFlip();
    }

    // WARN: A running CSS target, never an instant jump. The scroller is frozen at its pre-step height and re-pinned to its own bottom below, so the content has not visibly moved at the frame this runs — easing it forward to the cumulative delta is the whole of the motion, and the already-declared `transition` retargets on its own from wherever it currently sits.
    // WARN: Two recipes, and only the keyboard's own shrink takes the freeze. There the scroller's box got shorter with `scrollHeight` untouched, so holding the old height means nothing has visibly moved and the content can ease *forward*. Every other step — a growth, or either sheet toggle — has already been painted at its final geometry by a `scrollTop` clamp or a spacer inside `scrollHeight`, so the pin commits the bottom and the content is inverted by the same screen shift the composer made (`prior − delta`) and released.
    function stepListFlip(delta: number, usesFreeze: boolean, scroller: HTMLElement) {
      const content = contentRef.current;

      if (!content) {
        return;
      }

      // INFO: A recipe change mid-flight commits the running animation and starts clean — folding an inversion into a frozen run has no single consistent geometry.
      if (listFlipRef.current !== null && listFlipRef.current.usesFreeze !== usesFreeze) {
        finishListFlip({ pinToBottom: listFlipRef.current.isPinned });
      }

      const running = listFlipRef.current;

      if (!usesFreeze) {
        const priorOffset = running === null ? 0 : readTranslateY(content);
        // WARN: Algebra over fresh reads, never a stored baseline — rows re-measure and images land between steps, so any remembered scrollHeight is stale, and the clamp fires `scroll` before this observer so a listener is post-step too. A sheet step moved `scrollHeight` by −delta and a keyboard step moved `clientHeight` by +delta, and both leave the pre-step maximum at the same expression.
        const priorMax = Math.max(scroller.scrollHeight - scroller.clientHeight + delta, 0);

        pinToBottom(scroller);

        // INFO: What the clamp and the pin actually moved a bottom-pinned view by — `0` on a list too short to scroll, where the composer's own delta would invert a shift that never happened and play it back as a yank.
        const inverted = priorOffset + (scroller.scrollTop - priorMax);

        debugLog("invert", { prior: priorOffset, priorMax, st: scroller.scrollTop, inverted });

        if (running === null && Math.abs(inverted) <= BOTTOM_EPSILON) {
          return;
        }

        listFlipRef.current = {
          usesFreeze,
          naturalHeight: scrollerHeightRef.current,
          frozenScrollTop: scroller.scrollTop,
          isPinned: true,
        };

        if (running === null) {
          startListFlipRun(content, scroller);
        }

        content.style.transition = "none";
        content.style.transform = `translateY(${inverted}px)`;
        cancelAnimationFrame(listReleaseFrameRef.current ?? -1);
        listReleaseFrameRef.current = requestAnimationFrame(() => {
          listReleaseFrameRef.current = undefined;
          content.style.transition = FLIP_TRANSITION;
          content.style.transform = "translateY(0px)";
        });

        return;
      }

      // INFO: The scroller is already laid out at its post-step size when a first step lands, so the natural height is read there and stepped by the composer's own delta afterwards, while the freeze hides both from the reader.
      const naturalHeight =
        running === null ? scroller.getBoundingClientRect().height : running.naturalHeight + delta;
      const frozenScrollTop = running === null ? scroller.scrollTop : running.frozenScrollTop;
      // INFO: Where the commit's pin will land against the natural size — `0` of travel on a list too short to scroll, so nothing is eased that the unfreeze would only snap back.
      const target = frozenScrollTop - Math.max(scroller.scrollHeight - naturalHeight, 0);

      debugLog("freeze", { naturalHeight, frozenScrollTop, sh: scroller.scrollHeight, target });

      if (running === null && Math.abs(target) <= BOTTOM_EPSILON) {
        return;
      }

      listFlipRef.current = { usesFreeze, naturalHeight, frozenScrollTop, isPinned: true };

      if (running === null) {
        scroller.style.height = `${scrollerHeightRef.current}px`;
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

      // WARN: The decision made when the run started, never `isAtBottomRef` re-read here — iOS leaves that ref stale false after a rubber-band settle, and the reader has not scrolled since or the run would already be torn down.
      finishListFlip({ pinToBottom: listFlipRef.current?.isPinned ?? false });
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

      // INFO: A one-shot read — the room sets this just ahead of the toggle, and it must not survive to misread the next unrelated resize (typing growth included).
      const sheetFlipValue = container.getAttribute(SHEET_FLIP_ATTRIBUTE);
      const isSheetFlipStep = sheetFlipValue !== null && topDelta !== 0;

      container.removeAttribute(SHEET_FLIP_ATTRIBUTE);

      debugLog("measure", {
        ch: containerHeight,
        top: composerTop,
        dTop: topDelta,
        kb: isKeyboardStep,
        sheet: isSheetFlipStep,
        atBtm: isAtBottomRef.current,
        st: scroller?.scrollTop ?? -1,
        sh: scroller?.scrollHeight ?? -1,
        cl: scroller?.clientHeight ?? -1,
        refCh: scrollerHeightRef.current,
      });

      let didAnimateList = false;

      // WARN: The overlaid attribute vetoes only the keyboard's own steps — during a swap the screen is pinned and there is nothing to animate. A sheet step ignores it: the 검색 exemption holds that attribute for as long as the panel sits on that menu, with no keyboard anywhere near.
      const isFlipStep =
        isSheetFlipStep ||
        (isKeyboardStep && !document.documentElement.hasAttribute(KEYBOARD_OVERLAID_ATTRIBUTE));

      if (isFlipStep && !reducedMotion.matches) {
        // WARN: The cleanup and not just a skip — a drag begun mid-FLIP retargets the inline transition instead of ending it, and inline beats the reset frame's `transition-none` class, easing the removed drag transform from the cap so the composer dives below its spot and slides back up.
        if (sheetFlipValue === SHEET_FLIP_LIST_ONLY) {
          finishComposerFlip();
        } else {
          stepComposerFlip(topDelta);
        }

        // WARN: Never `isAtBottomRef` alone — iOS leaves it stale false after a rubber-band settle (measured on device: the sheet then opened over an unpushed list). The step's own shift is `topDelta`, so the pre-step distance is reconstructed from the one already laid out.
        const distance = scroller
          ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
          : Number.POSITIVE_INFINITY;
        const wasAtBottom =
          isAtBottomRef.current ||
          distance <= BOTTOM_EPSILON ||
          Math.abs(distance - Math.abs(topDelta)) <= STEP_EPSILON;

        if (scroller && wasAtBottom) {
          stepListFlip(topDelta, isKeyboardStep && topDelta < 0, scroller);
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
