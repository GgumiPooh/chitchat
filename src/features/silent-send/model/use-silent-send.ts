"use client";

import {
  fromNotifyModeIndex,
  nextNotifyMode,
  NOTIFY_MODE_COOKIE_NAME,
  toNotifyModeIndex,
  type NotifyMode,
} from "@/shared/config";
import { A_DAY, A_SECOND } from "@/shared/lib";
import { useCallback } from "react";
import { useCookieState } from "synced-storage/react";

const MAX_AGE = (365 * A_DAY) / A_SECOND;

/**
 * REQUIREMENTS.md § 16.1. 조용히 보내기 / 나에게만 보내기 — cookie-backed so the
 * chat header paints the right icon on the server render, exactly as
 * `useSidePanel` does for the side panel's own cookie.
 *
 * WARN: The cookie holds `toNotifyModeIndex`'s number, not the mode string — see
 * that function's own WARN for why a string here would break the server render.
 */
export function useSilentSend() {
  const [index, setIndex] = useCookieState<number>(NOTIFY_MODE_COOKIE_NAME, 0, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
  const mode = fromNotifyModeIndex(index);

  const setMode = useCallback(
    (next: NotifyMode | ((current: NotifyMode) => NotifyMode)) =>
      setIndex((currentIndex) => {
        const currentMode = fromNotifyModeIndex(currentIndex);

        return toNotifyModeIndex(typeof next === "function" ? next(currentMode) : next);
      }),
    [setIndex],
  );

  /** § 8.14.'s `⌃S` target — the room's own shortcut, not the header sheet's three explicit rows. */
  const cycle = useCallback(() => setMode((current) => nextNotifyMode(current)), [setMode]);

  return { mode, setMode, cycle };
}
