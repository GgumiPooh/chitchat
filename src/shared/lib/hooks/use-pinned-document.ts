"use client";

import { useEffect } from "react";

/**
 * DESIGN.md § 3.4. Refuses the document any offset of its own while `active`, and puts
 * one back if it takes one anyway.
 *
 * WARN: For the chat screen, which is `fixed` and sized from the visual viewport, so
 * the document under it is never meant to move at all. iOS moves it anyway: with the
 * keyboard up the layout viewport stays its full height while the visual viewport is
 * only what the keys leave over, and WebKit lets a drag pan the page across exactly
 * that difference — `clientHeight - visualViewport.height`, reported as `scrollY` and
 * as `visualViewport.offsetTop` together. The screen then re-sizes itself to a visual
 * viewport that has shrunk further (Safari expands its own bars for the scroll), and
 * the shortfall is the empty strip that opens under the composer.
 *
 * WARN: Neither `overflow: hidden` nor `touch-action` stops this, and both were tried.
 * The pan is not an overflow scroll — the document is not taller than the viewport here
 * — so there is no overflow to refuse; and WebKit performs the pan itself rather than as
 * the touch scroll a `touch-action` declaration could deny. Cancelling the gesture and
 * restoring the offset are what is left, so this does both.
 */
export function usePinnedDocument(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    // INFO: Decided once per gesture in `touchstart` rather than per move — the walk below reads `getComputedStyle`, and a `touchmove` fires for every frame of a drag.
    let isGestureAllowed = false;

    /**
     * WARN: A gesture that began inside something with scrolling left to do is let
     * through untouched — the message list, the emoticon panel's grid, a media tray.
     * Cancelling those would take the app's own scrolling down with the pan.
     */
    const start = (event: TouchEvent) => {
      isGestureAllowed =
        event.touches.length > 1 ||
        (event.target instanceof Node && hasScrollableAncestor(event.target));
    };

    // WARN: Non-passive, or `preventDefault` is inert and the console says so. This is the listener that stops the pan from ever starting.
    const guard = (event: TouchEvent) => {
      if (!isGestureAllowed && event.cancelable) {
        event.preventDefault();
      }
    };

    // INFO: The belt to that braces. A pan WebKit performs for a reason other than a drag — revealing a field it has just focused — raises no `touchmove` to cancel.
    const pin = () => {
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    pin();
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", guard, { passive: false });
    window.addEventListener("scroll", pin, { passive: true });

    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", guard);
      window.removeEventListener("scroll", pin);
    };
  }, [active]);
}

/** Whether `node` sits inside an element that still has somewhere of its own to scroll. */
function hasScrollableAncestor(node: Node): boolean {
  let element = node instanceof Element ? node : node.parentElement;

  while (element && element !== document.body) {
    // WARN: Either axis counts — the picker's pack strip scrolls only sideways, and reading `overflowY` alone cancelled every drag across it.
    if (isScrollableOn(element, "x") || isScrollableOn(element, "y")) {
      return true;
    }

    element = element.parentElement;
  }

  return false;
}

/** Whether `element` declares a scroller on `axis` and holds more than it shows there. */
function isScrollableOn(element: Element, axis: "x" | "y"): boolean {
  const style = getComputedStyle(element);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;

  if (overflow !== "auto" && overflow !== "scroll") {
    return false;
  }

  // INFO: Both halves are needed — a declared scroller holding less than it shows cannot consume the drag either, and the pan happens instead.
  return axis === "x"
    ? element.scrollWidth > element.clientWidth
    : element.scrollHeight > element.clientHeight;
}
