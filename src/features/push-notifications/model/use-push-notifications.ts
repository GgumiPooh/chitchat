"use client";

import { toast } from "@/shared/ui";
import { useEffect, useRef, useState } from "react";
import {
  setPushSoundEnabled,
  subscribeToPush,
  syncPushSubscription,
  unsubscribeFromPush,
  type PushState,
  type PushStatus,
} from "./push-registration";
import { usePushStateCache } from "./use-push-state-cache";

const FAILED_ON_MESSAGE = "알림을 켜지 못했어요";
const FAILED_OFF_MESSAGE = "알림을 끄지 못했어요";
const FAILED_SAVE_MESSAGE = "설정을 저장하지 못했어요";

export type PushNotificationsValue = {
  status: PushStatus;
  isBusy: boolean;
  soundEnabled: boolean;
  isSoundBusy: boolean;
  toggle: (isOn: boolean) => void;
  toggleSound: (isOn: boolean) => void;
};

/** Drives the Settings toggles of REQUIREMENTS.md § 16.1. */
export function usePushNotifications(): PushNotificationsValue {
  const [cached, setCached] = usePushStateCache();
  // INFO: REQUIREMENTS.md § 16.1. Seeded from the cookie so the switches paint where they were last seen; the launch sync below still runs and corrects a permission revoked or a row retired meanwhile.
  const [state, setState] = useState<PushState>(
    cached ?? { status: "unsupported", soundEnabled: true },
  );
  const [isBusy, setIsBusy] = useState(cached === null);
  const [isSoundBusy, setIsSoundBusy] = useState(false);
  // WARN: The launch sync and a toggle both write `status`, and the first one started is not the first one to finish — `serviceWorker.register()` can take seconds on a first visit, long enough for the user to grant permission and subscribe meanwhile. Without a claim the stale `off` lands last and snaps the switch back over a subscription the server already stored.
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const requestId = claimRequest();

    void syncPushSubscription(cached).then((next) => {
      if (isLatestRequest(requestId)) {
        setState(next);
        setCached(next);
        setIsBusy(false);
      }
    });

    return () => {
      claimRequest();
    };
  }, [cached, setCached]);

  return { ...state, isBusy, isSoundBusy, toggle, toggleSound };

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

        settle(next);

        // INFO: A refused permission prompt resolves rather than rejects, so the switch would otherwise just snap back unexplained. The `blocked` row description carries the recovery step, so the toast must not repeat it.
        if (isOn && next.status !== "on") {
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

  // INFO: REQUIREMENTS.md § 16.1. Moved optimistically like § 8.12.'s 입력 중 표시 switch, and put back on failure — left where the tap moved it, the row would report a preference the server never took.
  function toggleSound(isOn: boolean) {
    setState((current) => ({ ...current, soundEnabled: isOn }));
    setIsSoundBusy(true);

    void setPushSoundEnabled(isOn)
      .then(() => setCached((current) => current && { ...current, soundEnabled: isOn }))
      .catch(() => {
        setState((current) => ({ ...current, soundEnabled: !isOn }));
        toast.error(FAILED_SAVE_MESSAGE);
      })
      .finally(() => setIsSoundBusy(false));
  }

  function settle(next: PushState) {
    setState(next);
    setCached(next);
  }

  function claimRequest(): number {
    latestRequestRef.current += 1;

    return latestRequestRef.current;
  }

  function isLatestRequest(requestId: number): boolean {
    return latestRequestRef.current === requestId;
  }
}
