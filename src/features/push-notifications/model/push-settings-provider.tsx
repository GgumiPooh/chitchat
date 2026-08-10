"use client";

import type { Nullable } from "@/shared/lib";
import { createContext, useContext, type PropsWithChildren } from "react";
import { usePushNotifications, type PushNotificationsValue } from "./use-push-notifications";

export type PushSettingsProviderProps = PropsWithChildren;

const PushSettingsContext = createContext<Nullable<PushNotificationsValue>>(null);

/**
 * Holds one push state for the 알림 and 알림 소리 rows (`REQUIREMENTS.md § 16.1.`).
 *
 * WARN: One instance for both rows rather than a hook each. The launch sync is a
 * `POST` that stores the subscription, so a second hook would re-register the device
 * on every Settings mount — and the two rows would then settle from separate
 * responses, letting 알림 소리 sit enabled beside an 알림 switch that has gone off.
 */
export function PushSettingsProvider({ children }: PushSettingsProviderProps) {
  // WARN: The value is a fresh object every render by design — it carries `isBusy`, which moves on every step of a toggle, so memoizing it would only hide that.
  const value = usePushNotifications();

  return <PushSettingsContext.Provider value={value}>{children}</PushSettingsContext.Provider>;
}

export function usePushSettings(): PushNotificationsValue {
  const value = useContext(PushSettingsContext);

  if (!value) {
    throw new Error("usePushSettings must be used inside PushSettingsProvider");
  }

  return value;
}
