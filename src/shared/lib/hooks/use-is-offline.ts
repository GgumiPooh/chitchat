"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { A_SECOND } from "../date/time";

// INFO: Only the offline direction waits — a blip that flashes the banner is the failure worth paying a second for, where a second of silence while cached content reads normally costs nothing.
const SETTLE_DELAY = A_SECOND;

// WARN: Module constants, never inline arrows. `useSyncExternalStore` re-subscribes whenever `subscribe` changes identity, so a fresh closure per render is a teardown and a re-register on every commit.
const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("online", onStoreChange);
  window.addEventListener("offline", onStoreChange);

  return () => {
    window.removeEventListener("online", onStoreChange);
    window.removeEventListener("offline", onStoreChange);
  };
};

const getSnapshot = () => !navigator.onLine;
// INFO: The server has no network state to report, and this is also the hydration answer — `useSyncExternalStore` renders it while hydrating and the real one before paint.
const getServerSnapshot = () => false;

/**
 * Whether the device has reported no network for long enough to say so.
 *
 * WARN: A hint, never a gate. MDN records `navigator.onLine` as inherently unreliable — a LAN with no route out still reports online — so nothing may disable a feature or refuse a request on this.
 */
export function useIsOffline(): boolean {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [hasSettled, setHasSettled] = useState(false);

  useEffect(() => {
    if (!isOffline) {
      return;
    }

    const timer = setTimeout(() => setHasSettled(true), SETTLE_DELAY);

    return () => {
      clearTimeout(timer);
      setHasSettled(false);
    };
  }, [isOffline]);

  // WARN: Both terms, so the return goes false in the render the network comes back rather than in the effect after it — the delay is owed to arriving offline, not to leaving it.
  return isOffline && hasSettled;
}
