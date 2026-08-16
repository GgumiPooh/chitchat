"use client";

import { HEALTH_PATH } from "@/shared/config";
import { useEffect } from "react";
import { request } from "./request";

/**
 * Asks the server one question the moment the device claims to be offline, so
 * `useIsOffline`'s corroboration has something to settle on.
 *
 * INFO: The verdict waits for this app's own traffic to agree with `navigator.onLine` (REQUIREMENTS.md § 16.2.), and a screen nobody is touching makes no traffic — the stream is not a request, and a paused query is not a failure. Left alone, a reader who was doing something a moment ago waits out the rest of the corroboration window with nothing able to shorten it.
 *
 * WARN: One request per transition of the flag, never a poll. What is being watched here is a signal that changes, not a condition to be sampled — and § 8.4.1. exists to keep this app from making requests nobody asked for.
 *
 * WARN: The answer is discarded, and that is the whole design. `request` records both outcomes on its own, and it is the *arrival* that carries the meaning — a `4xx` is a server that heard the question, which is all this needs to know. Reading the status here would turn a deployment's own failure into an offline report.
 *
 * WARN: Mount it exactly once per document. `OfflineBanner` is where it lives because that is the one component both the shell and the mirror mount a single copy of; anything mounted per screen would fan one transition out into a request per instance.
 */
export function useNetworkProbe(): void {
  useEffect(() => {
    let isProbing = false;

    async function probe() {
      if (isProbing) {
        return;
      }

      isProbing = true;

      try {
        await request(HEALTH_PATH, { cache: "no-store" });
      } catch {
        // INFO: The rejection is the evidence, and `request` has already filed it.
      } finally {
        isProbing = false;
      }
    }

    window.addEventListener("offline", probe);

    return () => window.removeEventListener("offline", probe);
  }, []);
}
