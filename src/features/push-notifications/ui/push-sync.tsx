"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "../model/push-registration";
import { useNotificationSweep } from "../model/use-notification-sweep";
import { usePushStateCache } from "../model/use-push-state-cache";

/**
 * Renders nothing. It reconciles this device's push subscription on every launch
 * (REQUIREMENTS.md § 16.1.), which has to happen in the shell rather than in
 * Settings — a subscription silently retired while the app was closed would
 * otherwise stay broken until the user happened to open the settings screen.
 *
 * It also sweeps Notification Center on every entry, for the same reason: the
 * banners are raised on the four tabs alike, so clearing them belongs to the shell.
 */
export function PushSync() {
  useNotificationSweep();
  const [cached, setCached] = usePushStateCache();

  // INFO: REQUIREMENTS.md § 16.1. Writes the cookie 설정 is seeded from, so the rows are right on the first visit to that screen and not only after their own sync.
  useEffect(() => {
    void syncPushSubscription(cached).then(setCached);
  }, [cached, setCached]);

  return null;
}
