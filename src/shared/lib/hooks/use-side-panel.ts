"use client";

import { APP_SHELL_ID, SIDE_PANEL_COOKIE_NAME, SIDE_PANEL_SETTLED_EVENT } from "@/shared/config";
import { useCallback } from "react";
import { useCookieState } from "synced-storage/react";
import { A_DAY, A_SECOND } from "../date/time";

const MAX_AGE = (365 * A_DAY) / A_SECOND;

// WARN: Exported so `SidePanel`'s `onTransitionEnd` clears the same attribute name this sets.
export const SIDE_PANEL_ANIMATING_ATTRIBUTE = "data-side-panel-animating";

/** AGENTS.md § 4.4. Whether the `lg` side panel is mid width-transition — a measurement racing the animation defers by checking this first. */
export function isSidePanelAnimating(): boolean {
  return (
    document.getElementById(APP_SHELL_ID)?.hasAttribute(SIDE_PANEL_ANIMATING_ATTRIBUTE) ?? false
  );
}

/** AGENTS.md § 4.4. Runs `callback` once the panel's width transition ends (`SidePanel`'s `onTransitionEnd`), then unsubscribes. */
export function onSidePanelSettled(callback: () => void): () => void {
  const handler = () => callback();

  window.addEventListener(SIDE_PANEL_SETTLED_EVENT, handler, { once: true });

  return () => window.removeEventListener(SIDE_PANEL_SETTLED_EVENT, handler);
}

/**
 * AGENTS.md § 4.4. The `lg` side panel's collapse state, cookie-backed
 * so `app/(main)/layout.tsx` can paint `data-side-panel="closed"` on `#app-shell`
 * before hydration — see `theme.css`'s `:root:has(#app-shell[data-side-panel])`.
 */
// WARN: A boolean, never the `"open"`/`"closed"` strings — `universal-cookie` writes a string raw, and `synced-storage`'s SSR seeding `JSON.parse`s the cookie, so a bare word warns and hydrates as the default.
export function useSidePanel() {
  const [isOpen, setIsOpen] = useCookieState<boolean>(SIDE_PANEL_COOKIE_NAME, true, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });

  // WARN: Written on the toggle only, never from an effect on `isOpen` — `useCookieState` renders its default (open) once before it has read the cookie, and an effect keyed on that painted the panel open for a frame on every navigation. The server paints the attribute from the cookie.
  const set = useCallback(
    (next: boolean) => {
      setIsOpen(next);

      const shell = document.getElementById(APP_SHELL_ID);

      shell?.setAttribute("data-side-panel", next ? "open" : "closed");

      // INFO: AGENTS.md § 4.4. Reduced motion skips `SidePanel`'s transition entirely, so its `onTransitionEnd` never fires to clear this.
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        shell?.setAttribute(SIDE_PANEL_ANIMATING_ATTRIBUTE, "");
      }
    },
    [setIsOpen],
  );

  return {
    isOpen,
    open: useCallback(() => set(true), [set]),
    toggle: () => set(!isOpen),
  };
}
