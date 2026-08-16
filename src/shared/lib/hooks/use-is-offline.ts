"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getLastNetworkReachedAt, subscribeNetworkReached } from "../activity/network-reachability";
import { A_SECOND } from "../date/time";

// INFO: Only the offline direction waits — a blip that flashes the banner is the failure worth paying a second for, where a second of silence while cached content reads normally costs nothing.
const SETTLE_DELAY = A_SECOND;

/**
 * How recently the network has to have answered for `navigator.onLine`'s `false` to
 * be treated as contradicted.
 *
 * INFO: Comfortably longer than this app's own chattiness while somebody is using it — § 8.12.'s typing pings, a query refetch, the RSC fetch behind any route change — and short enough that an outage arriving straight after activity is still reported within half a minute. It only ever *delays* the verdict: past this window the arithmetic below falls back to `SETTLE_DELAY` and the behaviour is what it was before corroboration existed.
 */
const CORROBORATION_WINDOW = A_SECOND * 30;

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

const getReachedServerSnapshot = () => 0;

/**
 * Whether the device has reported no network for long enough, and with nothing
 * contradicting it, to say so.
 *
 * WARN: `navigator.onLine` alone is a hint and MDN says outright not to disable features on it — a VPN, a VM and several Linux stacks report `false` on a working connection, and this app refuses its whole write surface on this answer. So the flag is corroborated: a `false` is believed only once `CORROBORATION_WINDOW` has passed with no request of ours coming back. On a device where the flag is stuck, requests keep succeeding and the window keeps resetting, so the app never believes it; in a real outage nothing answers and the verdict lands as it always did.
 * WARN: This is the **presentational** answer, and the two places that classify a *failure* deliberately read `navigator.onLine` directly instead — the outbox's queued-versus-failed branch and `useLoadStatus`'s hold. Those run at the moment a request has already lost, where the flag is corroborated by the failure itself and a settle delay would file the answer wrongly.
 */
export function useIsOffline(): boolean {
  const isReportedOffline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const lastReachedAt = useSyncExternalStore(
    subscribeNetworkReached,
    getLastNetworkReachedAt,
    getReachedServerSnapshot,
  );
  const [hasSettled, setHasSettled] = useState(false);

  useEffect(() => {
    if (!isReportedOffline) {
      return;
    }

    // INFO: A request that lands mid-wait re-runs this effect through `lastReachedAt`, which clears the timer and starts the full window again — so any evidence at all pushes the verdict back out.
    const elapsed = Date.now() - lastReachedAt;
    const timer = setTimeout(
      () => setHasSettled(true),
      Math.max(SETTLE_DELAY, CORROBORATION_WINDOW - elapsed),
    );

    return () => {
      clearTimeout(timer);
      setHasSettled(false);
    };
  }, [isReportedOffline, lastReachedAt]);

  // WARN: Both terms, so the return goes false in the render the network comes back rather than in the effect after it — the delay is owed to arriving offline, not to leaving it.
  return isReportedOffline && hasSettled;
}
