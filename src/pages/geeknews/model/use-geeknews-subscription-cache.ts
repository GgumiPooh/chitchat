"use client";

import { GEEKNEWS_SUBSCRIPTION_COOKIE_NAME } from "@/shared/config";
import { A_DAY, A_SECOND, type Nullable } from "@/shared/lib";
import { useCookieState } from "synced-storage/react";

// INFO: REQUIREMENTS.md § 16.4. A cookie rather than `localStorage`, so the `(main)` layout's `ssrCookies` lets the GeekNews page paint the alert switch in its real position — `localStorage` is only readable after hydration and the row would visibly jump off → on.
const MAX_AGE = (365 * A_DAY) / A_SECOND;

/** REQUIREMENTS.md § 16.4. The last GeekNews alert subscription state this device settled on; `null` until a sync has answered once. */
export function useGeeknewsSubscriptionCache() {
  return useCookieState<Nullable<boolean>>(GEEKNEWS_SUBSCRIPTION_COOKIE_NAME, null, {
    strategy: "cookie",
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
  });
}
