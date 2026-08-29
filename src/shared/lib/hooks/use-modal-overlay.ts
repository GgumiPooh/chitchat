"use client";

import { useCallback, useEffect, useRef, type RefCallback } from "react";

const OVERLAY_MARKER = "data-modal-overlay";

/**
 * REQUIREMENTS.md § 8.4.1. What an open sheet, dialog or full-screen overlay looks
 * like from outside the component that raised it: Radix and Vaul write `data-state`,
 * and the hand-rolled screens are marked by `useModalOverlay` itself.
 */
// INFO: AGENTS.md § 4.1. `role="menu"` is `ActionSheet`'s desktop `Popover` — it portals to `body` at `z-50`, above `ShellOverlay`'s `z-40`, so Escape ownership between it and every other overlay resolves the same way a dialog's does.
export const OPEN_OVERLAY_SELECTOR = `[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [${OVERLAY_MARKER}]`;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "video[controls]",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * REQUIREMENTS.md § 12.3. The modal behaviour Radix would have supplied, for the two
 * screens that compose no Radix primitive — the profile screen and the § 7.10.
 * viewer. Attach the returned callback ref to the element that covers the shell.
 *
 * Owns three things, and owns them together because all three turn on the same
 * question of whether anything is open above: `Escape` dismissal, a `Tab` cycle that
 * cannot leave the overlay, and the marker that lets the other overlays ask.
 *
 * WARN: One owner, deliberately (§ 12.3.). Both screens dismissed on `Escape` from
 * their own copy of this before the trap existed, and a trap beside those copies
 * would have been the same predicate written a third and fourth time.
 *
 * @param onKeyDown Keys this hook does **not** own, forwarded to the caller — the
 * § 7.10. viewer's `ArrowLeft` / `ArrowRight`. It routes through here rather than
 * through a listener of the caller's own for the reason above: "is anything open over
 * me" is the same predicate, and a second copy of it would answer a share dialog's
 * arrow keys by swiping the track behind it.
 */
export function useModalOverlay<T extends HTMLElement>(
  onClose: () => void,
  onKeyDown?: (event: KeyboardEvent) => void,
): RefCallback<T> {
  const close = useRef(onClose);
  const keyDown = useRef(onKeyDown);

  // INFO: Held in a ref so the ref callback can be bound once. Every caller passes a fresh arrow, and re-binding on it would restore focus to the opener and seize it back on each parent render — in the chat room, on every message that arrives.
  useEffect(() => {
    close.current = onClose;
    keyDown.current = onKeyDown;
  }, [onClose, onKeyDown]);

  // WARN: A ref callback with a cleanup return, not a `useRef` read from an effect. `ProfileOverlay` renders `null` until the participant reaches it (§ 8.4.), and an effect that found no element on its one run would never bind again — leaving that instance untrapped and invisible to `isBusy`. React calls this on every attach and detach instead.
  return useCallback((container: T) => {
    // INFO: Written here rather than in the caller's JSX so that marking an overlay and behaving like one cannot come apart.
    container.setAttribute(OVERLAY_MARKER, "");

    const restoreTo = document.activeElement;

    // WARN: The container, not its first control. Focus lands inside the overlay either way, but a screen reader then announces the dialog and its label rather than opening on 닫기 — and `preventScroll` keeps the shell from jumping to it. It is why both callers carry a `role` and an `aria-label`.
    container.tabIndex = -1;
    container.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      // WARN: An overlay is the bottom of the stack as often as the top — a confirmation, the § 8.11. share dialog and the 프로필 편집 sheet all open over one of these, and each answers both keys itself. Acting anyway dismisses the overlay above and takes this one down with it.
      if (isCoveredFromAbove(container)) {
        return;
      }

      if (event.key === "Escape") {
        close.current();
      } else if (event.key === "Tab") {
        cycleFocus(event, container);
      } else {
        keyDown.current?.(event);
      }
    };

    // WARN: Capture, and `isCoveredFromAbove` is why. Radix and Vaul dismiss on `{ capture: true }`, so a bubble listener here ran after the sheet above had already closed itself and flushed — the check then found nothing above and took this screen down on the same keystroke.
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });

      // INFO: The element that opened the overlay is routinely gone by the time it closes — a 대화하기 that navigated away, or an avatar in a message that has since been deleted.
      if (restoreTo instanceof HTMLElement && restoreTo.isConnected) {
        restoreTo.focus({ preventScroll: true });
      }
    };
  }, []);
}

/**
 * Whether another overlay is stacked on top of this one, and so owns the keyboard.
 *
 * WARN: Only an overlay that *follows* this one in document order counts. Both
 * hand-rolled screens carry the marker, so "any other overlay" made a stacked pair
 * defer to each other — the § 7.10. viewer an avatar opens inside the § 12.3. profile
 * screen left neither of them answering `Escape`, and the trap skipped in both.
 *
 * INFO: Document order *is* the stacking order for these: `ShellOverlay` portals both
 * into the same shell node at the same `z-index`, so the later sibling paints over the
 * earlier, and Radix and Vaul portal to the end of `body` — after the shell entirely.
 * A descendant counts too; the DOM spec reports `CONTAINED_BY` with `FOLLOWING` set.
 */
function isCoveredFromAbove(container: HTMLElement): boolean {
  return [...document.querySelectorAll(OPEN_OVERLAY_SELECTOR)].some(
    (overlay) =>
      overlay !== container &&
      Boolean(container.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
}

function cycleFocus(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = readFocusable(container);

  if (focusable.length === 0) {
    event.preventDefault();

    return;
  }

  // INFO: `-1` is both "focus is outside the overlay" and "focus is on the container itself", which is where it starts — each wraps to the end of the cycle the key is travelling towards.
  const index = focusable.indexOf(document.activeElement as HTMLElement);
  const isLeavingBackwards = event.shiftKey && index <= 0;
  const isLeavingForwards = !event.shiftKey && (index === -1 || index === focusable.length - 1);

  if (isLeavingBackwards) {
    event.preventDefault();
    focusable[focusable.length - 1].focus();
  } else if (isLeavingForwards) {
    event.preventDefault();
    focusable[0].focus();
  }
}

/**
 * WARN: Filtered by visibility, not just by selector. The § 7.10. viewer keeps its
 * controls mounted as `invisible` rather than unmounting them, so a slide that cannot
 * be shared still has the share button in the DOM — the browser skips it on `Tab`,
 * and a cycle that ended on it would call `focus()` on something that cannot take it
 * and strand focus on `body`.
 *
 * WARN: `opacityProperty` is the second half and it is not optional. `visibilityProperty` alone answers for `invisible` only, and DESIGN.md § 7.10.'s chrome hides by fading to `opacity-0` so the fade can run — which this filter reads as perfectly focusable. `cycleFocus` then calls `focus()` **directly**, so a `tabIndex={-1}` on the control is no defence inside a hand-rolled trap: `Shift+Tab` would land on an invisible 공유 and `Enter` would fire it.
 */
function readFocusable(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) =>
      element.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true,
  );
}
