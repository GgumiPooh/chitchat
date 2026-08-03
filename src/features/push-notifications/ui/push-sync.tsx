"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "../model/push-registration";

/**
 * Renders nothing. It reconciles this device's push subscription on every launch
 * (REQUIREMENTS.md § 16.1.), which has to happen in the shell rather than in
 * Settings — a subscription silently retired while the app was closed would
 * otherwise stay broken until the user happened to open the settings screen.
 */
export function PushSync() {
  useEffect(() => {
    void syncPushSubscription();
  }, []);

  return null;
}
