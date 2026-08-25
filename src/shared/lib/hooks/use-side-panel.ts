"use client";

import { APP_SHELL_ID, SIDE_PANEL_COOKIE_NAME } from "@/shared/config";
import { useCallback } from "react";
import { useCookieState } from "synced-storage/react";
import { A_DAY, A_SECOND } from "../date/time";

const MAX_AGE = (365 * A_DAY) / A_SECOND;

type SidePanelState = "open" | "closed";

/**
 * AGENTS.md § 4.4. The `lg` side panel's collapse state, cookie-backed
 * so `app/(main)/layout.tsx` can paint `data-side-panel="closed"` on `#app-shell`
 * before hydration — see `theme.css`'s `:root:has(#app-shell[data-side-panel])`.
 */
export function useSidePanel() {
  const [state, setState] = useCookieState<SidePanelState>(SIDE_PANEL_COOKIE_NAME, "open", {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
  const isOpen = state === "open";

  // WARN: Written on the toggle only, never from an effect on `state` — `useCookieState` renders its default (`open`) once before it has read the cookie, and an effect keyed on that painted the panel open for a frame on every navigation. The server paints the attribute from the cookie.
  const set = useCallback(
    (next: SidePanelState) => {
      setState(next);
      document.getElementById(APP_SHELL_ID)?.setAttribute("data-side-panel", next);
    },
    [setState],
  );

  return {
    isOpen,
    open: useCallback(() => set("open"), [set]),
    toggle: () => set(isOpen ? "closed" : "open"),
  };
}
