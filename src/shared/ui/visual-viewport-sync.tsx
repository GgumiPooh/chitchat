"use client";

import {
  KEYBOARD_OVERLAID_ATTRIBUTE,
  MIN_KEYBOARD_HEIGHT,
  VIEWPORT_QUIET_WINDOW,
  isEditableElement,
  safelyGet,
  safelyRun,
} from "@/shared/lib";
import { useEffect } from "react";

const HEIGHT_PROPERTY = "--viewport-height";
const RESTING_HEIGHT_PROPERTY = "--viewport-resting-height";
const KEYBOARD_HEIGHT_PROPERTY = "--keyboard-height";
// INFO: DESIGN.md § 3.4. Remembered across launches so the emoticon sheet opens at the keyboard's height before the keyboard has been up once this session.
const KEYBOARD_HEIGHT_KEY = "jandh:keyboard-height";
const TOP_PROPERTY = "--viewport-top";
const BOTTOM_PROPERTY = "--viewport-bottom";
// INFO: DESIGN.md § 3.4. Arms the eased responses to a viewport move, which are corrections rather than motion until a height has actually been measured.
const SYNCED_ATTRIBUTE = "data-viewport-synced";

/**
 * Mirrors the visual viewport onto the root element so the app shell can size
 * itself to what is actually visible while the on-screen keyboard is up
 * (DESIGN.md § 3.4.), and `--viewport-resting-height` — the height last seen with
 * no field focused — for the one box that stands still under the keys instead, and
 * `--keyboard-height`, the keys' own height as last measured, which the emoticon
 * sheet rests at so the composer does not move between the two.
 * `--viewport-width` and the left/right offsets are not synced: zooming is off
 * (`maximumScale: 1`), so they never leave their resting values.
 */
export function VisualViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    // WARN: DESIGN.md § 3.4. Armed here too, or an engine without the API leaves the composer's arrival paused for good.
    if (!viewport) {
      // WARN: Last, and after the `clientHeight` read above. That forced layout is what commits the new height while `--viewport-settle-duration` is still `0s` (theme.css); hoisting or caching the read puts the height and the duration in one recalculation, a transition takes its after-change duration, and the cold launch glides 200ms again.
      root.setAttribute(SYNCED_ATTRIBUTE, "");

      return () => root.removeAttribute(SYNCED_ATTRIBUTE);
    }

    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout>;
    let restingHeight = viewport.height;
    let keyboardHeight = 0;
    // WARN: As `useIsVirtualKeyboardOpen` is gated — a desktop window resized while a field is focused is a drop past the threshold too, and it would be remembered as a keyboard.
    const hasVirtualKeyboard = matchMedia("(pointer: coarse)").matches;
    const storedKeyboardHeight = Number(safelyGet(() => localStorage.getItem(KEYBOARD_HEIGHT_KEY)));

    if (storedKeyboardHeight > MIN_KEYBOARD_HEIGHT) {
      root.style.setProperty(KEYBOARD_HEIGHT_PROPERTY, `${storedKeyboardHeight}px`);
    }

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", syncPan);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", syncPan);
      root.style.removeProperty(HEIGHT_PROPERTY);
      root.style.removeProperty(RESTING_HEIGHT_PROPERTY);
      root.style.removeProperty(TOP_PROPERTY);
      root.style.removeProperty(BOTTOM_PROPERTY);
      root.removeAttribute(SYNCED_ATTRIBUTE);
    };

    // INFO: The keyboard animates open over several frames, and each one fires the event — coalescing keeps the shell to one resize per frame.
    function sync() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(write);
    }

    /**
     * WARN: DESIGN.md § 3.4. Written straight out of the handler, never through the
     * `rAF` above. WebKit pans the visual viewport on the compositor and reports it
     * here afterwards, so every frame this write is deferred by is a frame the
     * `fixed` chrome spends at the wrong offset — which is what the composer wobbles
     * with while the reader scrolls with the keyboard up. The height keeps its
     * coalescing: it moves in a handful of coarse steps, not per frame.
     *
     * WARN: The `sync()` below still runs, because `--viewport-bottom` is derived from
     * `offsetTop` too and would go stale through a pan. It stays in the `rAF` rather
     * than being written here: it reads `root.clientHeight`, and coalescing is what
     * holds that forced layout to one per frame where a pan fires several.
     */
    function syncPan() {
      root.style.setProperty(TOP_PROPERTY, `${(viewport as VisualViewport).offsetTop}px`);
      sync();
    }

    function write() {
      const { height, offsetTop } = viewport as VisualViewport;

      root.style.setProperty(HEIGHT_PROPERTY, `${height}px`);
      // WARN: DESIGN.md § 3.4. Held while a field is focused rather than the largest height seen at this width — Safari's toolbar collapses on the document-scrolling screens and chat never sees that height, so a maximum left the chat screen a toolbar too tall once the keys went down.
      // WARN: REQUIREMENTS.md § 13.6. Held through an overlaid swap too, and the focus test cannot cover it: the emoticon toggle blurs the field *before* the keys start sliding, so every mid-slide height was recorded as a resting one and the screen pinned to this chased the keyboard it is held clear of.
      if (
        !isEditableElement(document.activeElement) &&
        !root.hasAttribute(KEYBOARD_OVERLAID_ATTRIBUTE)
      ) {
        restingHeight = height;
        root.style.setProperty(RESTING_HEIGHT_PROPERTY, `${height}px`);
      }

      const drop = restingHeight - height;

      // INFO: The keys slide up in coarse steps, so the running maximum of one open is what settles on their full height; a drop under the threshold is a toolbar, not a keyboard.
      // WARN: REQUIREMENTS.md § 13.6. Published once the viewport has gone quiet, never per step. The emoticon sheet rests at this height and stays open for the whole of a closing swap, so a step of the rise written straight out lands as a sheet that shrinks to 170px and grows back with the composer riding on it.
      if (!hasVirtualKeyboard || drop <= MIN_KEYBOARD_HEIGHT) {
        keyboardHeight = 0;
      } else if (drop > keyboardHeight) {
        keyboardHeight = drop;
        clearTimeout(settleTimer);
        settleTimer = setTimeout(publishKeyboardHeight, VIEWPORT_QUIET_WINDOW);
      }

      root.style.setProperty(TOP_PROPERTY, `${offsetTop}px`);
      // INFO: DESIGN.md § 3.4. What a portalled overlay needs: a `fixed` box outside the shell resolves `bottom` against the layout viewport, which the keyboard never shrinks.
      // WARN: Nothing sizes itself to the layout viewport through this component. A background that must ignore the keyboard takes the `lvh` unit directly (§ 3.4.) — `clientHeight` is not that, since Chromium's `interactive-widget=resizes-content` shrinks the layout viewport too.
      root.style.setProperty(
        BOTTOM_PROPERTY,
        `${Math.max(root.clientHeight - offsetTop - height, 0)}px`,
      );
      root.setAttribute(SYNCED_ATTRIBUTE, "");
    }

    // WARN: The guard is the keys having gone down inside the quiet window, which resets the maximum to `0` — published, that is a sheet of no height at all.
    function publishKeyboardHeight() {
      if (keyboardHeight <= MIN_KEYBOARD_HEIGHT) {
        return;
      }

      root.style.setProperty(KEYBOARD_HEIGHT_PROPERTY, `${keyboardHeight}px`);
      safelyRun(() => localStorage.setItem(KEYBOARD_HEIGHT_KEY, String(keyboardHeight)));
    }
  }, []);

  return null;
}
