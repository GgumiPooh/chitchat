"use client";

import { PUSH_STATE_COOKIE_NAME } from "@/shared/config";
import { A_DAY, A_SECOND, type Nullable } from "@/shared/lib";
import { useCookieState } from "synced-storage/react";
import type { PushState } from "./push-registration";

// INFO: A cookie rather than `localStorage`, so the `(main)` layout's `ssrCookies` lets 설정 paint the switches in their real position — `localStorage` is only readable after hydration and the row would visibly jump off → on.
const MAX_AGE = (365 * A_DAY) / A_SECOND;

/** REQUIREMENTS.md § 16.1. The last `PushState` this installation settled on; `null` until a sync has answered once. */
export function usePushStateCache() {
  return useCookieState<Nullable<PushState>>(PUSH_STATE_COOKIE_NAME, null, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
}
