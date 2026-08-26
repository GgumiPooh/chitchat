"use client";

import { SILENT_SEND_COOKIE_NAME } from "@/shared/config";
import { A_DAY, A_SECOND } from "@/shared/lib";
import { useCallback } from "react";
import { useCookieState } from "synced-storage/react";

const MAX_AGE = (365 * A_DAY) / A_SECOND;

/**
 * REQUIREMENTS.md § 16.1. 조용히 보내기 — cookie-backed so the chat header paints
 * the right icon on the server render, exactly as `useSidePanel` does for the
 * side panel's own cookie.
 */
export function useSilentSend() {
  const [isSilent, setIsSilent] = useCookieState<boolean>(SILENT_SEND_COOKIE_NAME, false, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });

  /** § 8.14.'s `⌃S` target — the room's own shortcut, not the header sheet's two explicit rows. */
  const toggle = useCallback(() => setIsSilent((current) => !current), [setIsSilent]);

  return { isSilent, setIsSilent, toggle };
}
