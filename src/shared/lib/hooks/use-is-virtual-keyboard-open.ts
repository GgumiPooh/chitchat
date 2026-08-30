"use client";

import { useEffect, useState } from "react";
import { A_SECOND } from "../date/time";
import { isEditableElement } from "../dom/environment";
import { useIsCoarsePointer } from "./use-is-coarse-pointer";

// INFO: A collapsing address bar shrinks the viewport by roughly 60–80px; only a larger drop can be a keyboard.
export const MIN_KEYBOARD_HEIGHT = 160;

// INFO: DESIGN.md § 3.4. Published by the chat room while the emoticon sheet stands in the keyboard's slot; `VisualViewportSync` holds the resting height for as long as it is up.
export const KEYBOARD_OVERLAID_ATTRIBUTE = "data-keyboard-overlaid";

// INFO: REQUIREMENTS.md § 13.6. How long the visual viewport must go quiet before a keyboard animation counts as finished — neither engine reports the end of one.
// WARN: Not shorter. WebKit reports the slide in a handful of coarse steps, and a window narrower than the gap between two of them settles in the middle of the keyboard's move — which is the early end this exists to remove.
export const VIEWPORT_QUIET_WINDOW = A_SECOND / 5;

/**
 * Whether the visual viewport is still moving — a keyboard mid-slide, up or down.
 * The keyboard flag alone flips at `MIN_KEYBOARD_HEIGHT`, which is several frames
 * before the keys have arrived (REQUIREMENTS.md § 13.6.).
 */
export function useIsViewportSettling(): boolean {
  const [isSettling, setIsSettling] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    viewport.addEventListener("resize", sync);

    return () => {
      clearTimeout(timer);
      viewport.removeEventListener("resize", sync);
    };

    function sync() {
      setIsSettling(true);
      clearTimeout(timer);
      timer = setTimeout(() => setIsSettling(false), VIEWPORT_QUIET_WINDOW);
    }
  }, []);

  return isSettling;
}

/**
 * Whether the on-screen keyboard is currently covering part of the viewport.
 * Consumers use it to drop chrome that is anchored to the bottom of the
 * viewport (DESIGN.md § 7.3.), never to branch layout (AGENTS.md § 4.2.).
 */
export function useIsVirtualKeyboardOpen(): boolean {
  const isCoarsePointer = useIsCoarsePointer();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!isCoarsePointer || !viewport) {
      return;
    }

    // WARN: `resizes-content` shrinks the layout viewport too, so `innerHeight - visualViewport.height` stays ~0 — the drop from the tallest height seen at this width is the only signal left.
    let restingHeight = viewport.height;
    let restingWidth = viewport.width;
    let resumeTimer: ReturnType<typeof setTimeout>;

    sync();
    viewport.addEventListener("resize", sync);
    // INFO: Focus moving between two fields keeps the keyboard up and fires no resize, so the opening signal needs this; there is no `focusout` counterpart because blurring no longer closes the flag.
    document.addEventListener("focusin", sync);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);

    return () => {
      clearTimeout(resumeTimer);
      viewport.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
    };

    // WARN: DESIGN.md § 3.4. iOS closes the keyboard while the PWA is in the background and fires no `resize` on the way back, so the flag survives with no keys under it and the bars stay dropped; the late pass is WebKit reporting the restored height a beat after the app is shown, without an event of its own.
    function resume() {
      if (document.visibilityState !== "visible") {
        return;
      }

      clearTimeout(resumeTimer);
      sync();
      resumeTimer = setTimeout(sync, VIEWPORT_QUIET_WINDOW);
    }

    function sync() {
      const { width, height } = viewport as VisualViewport;

      if (width !== restingWidth) {
        restingWidth = width;
        restingHeight = height;
      }

      restingHeight = Math.max(restingHeight, height);

      const isCovered = restingHeight - height > MIN_KEYBOARD_HEIGHT;

      // INFO: The height drop alone misreads a short viewport; focus alone stays true after Android's back button closes the keyboard without blurring the field.
      // WARN: DESIGN.md § 7.3. Opening takes both signals, closing takes the viewport alone. `focusout` lands the frame the field is blurred while WebKit only reports the restored height once the keys have finished sliding, so an AND here dropped the flag ~250ms early and the bars rose against a shell edge still halfway up the screen.
      setIsOpen((current) =>
        current ? isCovered : isCovered && isEditableElement(document.activeElement),
      );
    }
  }, [isCoarsePointer]);

  // WARN: Gated on the pointer here rather than reset inside the effect — a device that gains a fine pointer mid-session (an iPad picking up a trackpad) leaves the effect with no listener to clear a stale `true`, which would unmount the tab bar for good.
  return isCoarsePointer && isOpen;
}
