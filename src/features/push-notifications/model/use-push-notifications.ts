"use client";

import { toast } from "@/shared/ui";
import { useEffect, useRef, useState } from "react";
import {
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush,
  type PushStatus,
} from "./push-registration";

const FAILED_ON_MESSAGE = "알림을 켜지 못했어요";
const FAILED_OFF_MESSAGE = "알림을 끄지 못했어요";

/** Drives the Settings toggle of REQUIREMENTS.md § 16.1. */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [isBusy, setIsBusy] = useState(true);
  // WARN: The launch sync and a toggle both write `status`, and the first one started is not the first one to finish — `serviceWorker.register()` can take seconds on a first visit, long enough for the user to grant permission and subscribe meanwhile. Without a claim the stale `off` lands last and snaps the switch back over a subscription the server already stored.
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const requestId = claimRequest();

    void syncPushSubscription().then((next) => {
      if (isLatestRequest(requestId)) {
        setStatus(next);
        setIsBusy(false);
      }
    });

    return () => {
      claimRequest();
    };
  }, []);

  return { status, isBusy, toggle };

  // WARN: Not `async` all the way up. The click handler must reach `Notification.requestPermission` inside the gesture that produced it, so nothing may be awaited before `subscribeToPush`.
  function toggle(isOn: boolean) {
    const requestId = claimRequest();

    setIsBusy(true);

    const request = isOn ? subscribeToPush() : unsubscribeFromPush();

    void request
      .then((next) => {
        if (!isLatestRequest(requestId)) {
          return;
        }

        setStatus(next);

        // INFO: A refused permission prompt resolves rather than rejects, so the switch would otherwise just snap back unexplained. The `blocked` row description carries the recovery step, so the toast must not repeat it.
        if (isOn && next !== "on") {
          toast.error(FAILED_ON_MESSAGE);
        }
      })
      .catch(() => toast.error(isOn ? FAILED_ON_MESSAGE : FAILED_OFF_MESSAGE))
      .finally(() => {
        if (isLatestRequest(requestId)) {
          setIsBusy(false);
        }
      });
  }

  function claimRequest(): number {
    latestRequestRef.current += 1;

    return latestRequestRef.current;
  }

  function isLatestRequest(requestId: number): boolean {
    return latestRequestRef.current === requestId;
  }
}
