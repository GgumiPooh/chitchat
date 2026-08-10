"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "../model/push-registration";
import { useNotificationSweep } from "../model/use-notification-sweep";

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

  useEffect(() => {
    void syncPushSubscription();
  }, []);

  return null;
}
