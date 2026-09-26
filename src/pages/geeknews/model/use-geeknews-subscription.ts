"use client";

import { request } from "@/shared/api";
import { useCallback, useEffect, useState } from "react";

export type GeeknewsSubscriptionValue = {
  isSubscribed: boolean;
  isPending: boolean;
  toggleSubscription: () => Promise<boolean>;
};

export function useGeeknewsSubscription(): GeeknewsSubscriptionValue {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function fetchSubscription() {
      try {
        const response = await request("/api/geeknews/subscription");
        if (response.ok) {
          const data = (await response.json()) as { enabled?: boolean };
          if (!isCancelled && typeof data.enabled === "boolean") {
            setIsSubscribed(data.enabled);
          }
        }
      } catch {
        // Fallback silently if offline or request fails
      } finally {
        if (!isCancelled) {
          setIsPending(false);
        }
      }
    }

    void fetchSubscription();

    return () => {
      isCancelled = true;
    };
  }, []);

  const toggleSubscription = useCallback(async (): Promise<boolean> => {
    setIsPending(true);
    const nextState = !isSubscribed;

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
      setIsSubscribed(resolved);
      return resolved;
    } catch (error) {
      setIsSubscribed(isSubscribed);
      throw error;
    } finally {
      setIsPending(false);
    }
  }, [isSubscribed]);

  return { isSubscribed, isPending, toggleSubscription };
}
