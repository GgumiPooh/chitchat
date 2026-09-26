"use client";

import { request } from "@/shared/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGeeknewsSubscriptionCache } from "./use-geeknews-subscription-cache";

export type GeeknewsSubscriptionValue = {
  isSubscribed: boolean;
  isPending: boolean;
  toggleSubscription: () => Promise<boolean>;
};

export function useGeeknewsSubscription(): GeeknewsSubscriptionValue {
  const [cached, setCached] = useGeeknewsSubscriptionCache();
  // INFO: REQUIREMENTS.md § 16.4. Seeded from the cookie so the switch paints in its real position before hydration; background sync updates if changed meanwhile.
  const [isSubscribed, setIsSubscribed] = useState<boolean>(cached ?? false);
  const [isPending, setIsPending] = useState<boolean>(cached === null);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    async function syncSubscription() {
      try {
        const response = await request("/api/geeknews/subscription");
        if (response.ok) {
          const data = (await response.json()) as { enabled?: boolean };
          if (latestRequestRef.current === requestId && typeof data.enabled === "boolean") {
            setIsSubscribed(data.enabled);
            setCached(data.enabled);
          }
        }
      } catch {
        // Silently fall back if offline or request fails
      } finally {
        if (latestRequestRef.current === requestId) {
          setIsPending(false);
        }
      }
    }

    void syncSubscription();

    return () => {
      latestRequestRef.current += 1;
    };
  }, [setCached]);

  const toggleSubscription = useCallback(async (): Promise<boolean> => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;

    setIsPending(true);
    const nextState = !isSubscribed;

    // Optimistic update to UI and cookie
    setIsSubscribed(nextState);
    setCached(nextState);

    try {
      const response = await request("/api/geeknews/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextState }),
      });

      if (!response.ok) {
        throw new Error(`PATCH /api/geeknews/subscription failed: ${response.status}`);
      }

      const data = (await response.json()) as { enabled?: boolean };
      const resolved = typeof data.enabled === "boolean" ? data.enabled : nextState;
      if (latestRequestRef.current === requestId) {
        setIsSubscribed(resolved);
        setCached(resolved);
      }
      return resolved;
    } catch (error) {
      if (latestRequestRef.current === requestId) {
        setIsSubscribed(isSubscribed);
        setCached(isSubscribed);
      }
      throw error;
    } finally {
      if (latestRequestRef.current === requestId) {
        setIsPending(false);
      }
    }
  }, [isSubscribed, setCached]);

  return { isSubscribed, isPending, toggleSubscription };
}
