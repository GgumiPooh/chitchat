"use client";

import { useEffect, useState } from "react";
import { isEditableElement } from "../dom/environment";
import { useIsCoarsePointer } from "./use-is-coarse-pointer";

// INFO: A collapsing address bar shrinks the viewport by roughly 60–80px; only a larger drop can be a keyboard.
const MIN_KEYBOARD_HEIGHT = 160;

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

    sync();
    viewport.addEventListener("resize", sync);
    // INFO: Focus moving between two fields keeps the keyboard up and fires no resize, so the opening signal needs this; there is no `focusout` counterpart because blurring no longer closes the flag.
    document.addEventListener("focusin", sync);

    return () => {
      viewport.removeEventListener("resize", sync);
      document.removeEventListener("focusin", sync);
    };

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
