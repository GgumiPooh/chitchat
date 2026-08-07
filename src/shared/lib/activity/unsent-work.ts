"use client";

import { useEffect } from "react";

/**
 * Whether anything on screen would be destroyed by reloading the document —
 * a half-typed message, a staged attachment, a send still in flight.
 *
 * A module-level registry rather than context: the only reader is the app-refresh
 * gate in the shell, and routing this through a provider would put every screen's
 * composer state above the screen that owns it.
 */
const probes = new Set<() => boolean>();

export function hasUnsentWork(): boolean {
  return [...probes].some((probe) => probe());
}

/**
 * Holds the reload for work that outlives the screen that started it, until the
 * returned release is called. `REQUIREMENTS.md § 15.1.` promises a bulk emoticon
 * add survives routing away, and a promise chain does — but `useUnsentWork` drops
 * its probe at unmount, so the hold has to belong to the work and not to a
 * component.
 *
 * WARN: Release it from a `finally`. A hold left standing pins every client on
 * this deployment for the rest of the session.
 */
export function holdUnsentWork(): () => void {
  const probe = () => true;

  probes.add(probe);

  return () => {
    probes.delete(probe);
  };
}

/**
 * Declares, for as long as the caller is mounted, whether it is holding work the
 * user has not committed yet. A reload forced by a new deployment waits for every
 * caller to report `false` (`REQUIREMENTS.md § 15.1.`).
 */
export function useUnsentWork(hasWork: boolean): void {
  useEffect(() => {
    // WARN: The probe closes over nothing — it is re-registered on every change of `hasWork`, so the set never holds a stale reading.
    const probe = () => hasWork;

    probes.add(probe);

    return () => {
      probes.delete(probe);
    };
  }, [hasWork]);
}
