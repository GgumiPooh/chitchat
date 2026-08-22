import type { PointerEvent } from "react";
import type { Maybe } from "../nullish";

/**
 * DESIGN.md § 3.4. Focuses a field without WebKit's pan to reveal it.
 *
 * WARN: `preventScroll` is the whole of it, and it is not about scrolling. iOS pans the
 * document to centre a field the keyboard is about to cover, before script is told —
 * measured at the full keyboard height for the composer — and `preventScroll` is the one
 * flag that stops it. A plain `focus()` on the chat route jolts every `fixed` box.
 */
export function focusWithoutPan(field: Maybe<HTMLElement>): void {
  field?.focus({ preventScroll: true });
}

/**
 * The `pointerdown` half of `focusWithoutPan`: a touch focuses natively and pans, so
 * the press is taken over and the focus moved by hand while the gesture still covers it.
 *
 * INFO: A touch only. A mouse pans nothing and its press is what places the caret.
 */
export function takeFocusWithoutPan(event: PointerEvent<HTMLElement>): void {
  const field = event.currentTarget;

  if (event.pointerType !== "touch" || document.activeElement === field) {
    return;
  }

  event.preventDefault();
  focusWithoutPan(field);
}
