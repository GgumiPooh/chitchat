"use client";

import { LOGIN_ROUTE } from "@/shared/config";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { type Nullable } from "../nullish";

const PREV_APP_ROUTE_KEY = "jandh_prev_app_route";
const CURR_APP_ROUTE_KEY = "jandh_curr_app_route";

/**
 * Tracks route changes across main app screens in `sessionStorage`
 * so back buttons can avoid returning to auth routes like `/login`.
 */
export function useAppRouteTracker(): void {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === LOGIN_ROUTE) {
      return;
    }

    try {
      const currentStored = sessionStorage.getItem(CURR_APP_ROUTE_KEY);
      if (currentStored && currentStored !== pathname) {
        sessionStorage.setItem(PREV_APP_ROUTE_KEY, currentStored);
      }
      sessionStorage.setItem(CURR_APP_ROUTE_KEY, pathname);
    } catch {
      // INFO: Storage access may throw in restricted browser contexts.
    }
  }, [pathname]);
}

export function getPreviousAppRoute(): Nullable<string> {
  try {
    return sessionStorage.getItem(PREV_APP_ROUTE_KEY);
  } catch {
    return null;
  }
}

export function clearAppRouteTracker(): void {
  try {
    sessionStorage.removeItem(PREV_APP_ROUTE_KEY);
    sessionStorage.removeItem(CURR_APP_ROUTE_KEY);
  } catch {
    // INFO: Storage access may throw in restricted browser contexts.
  }
}
