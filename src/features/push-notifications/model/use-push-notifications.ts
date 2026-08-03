"use client";

import { toast } from "@/shared/ui";
import { useEffect, useState } from "react";
import {
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush,
  type PushStatus,
} from "./push-registration";

/** Drives the Settings toggle of REQUIREMENTS.md § 16.1. */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [isBusy, setIsBusy] = useState(true);

  useEffect(() => {
    let isCurrent = true;

    void syncPushSubscription().then((next) => {
      if (isCurrent) {
        setStatus(next);
        setIsBusy(false);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, []);

  return { status, isBusy, toggle };

  // WARN: Not `async` all the way up. The click handler must reach `Notification.requestPermission` inside the gesture that produced it, so nothing may be awaited before `subscribeToPush`.
  function toggle(isOn: boolean) {
    setIsBusy(true);

    const request = isOn ? subscribeToPush() : unsubscribeFromPush();

    void request
      .then(setStatus)
      .catch(() => toast.error(isOn ? "알림을 켜지 못했어요" : "알림을 끄지 못했어요"))
      .finally(() => setIsBusy(false));
  }
}
