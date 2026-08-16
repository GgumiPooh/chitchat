"use client";

import { request } from "@/shared/api";
import { A_SECOND, safelyGet, safelyRun } from "@/shared/lib";
import { useEffect } from "react";

/**
 * WARN: The one thing that survives the reload it guards, so it cannot be a ref or a
 * module variable. Without it a probe that answers over a network that then drops
 * again lands back on the mirror, where the next foreground probes and reloads once
 * more — a loop the reader cannot leave.
 */
const RELOAD_MARK = "jandh:mirror-reloaded-at";

const RELOAD_COOLDOWN = A_SECOND * 10;

/**
 * Takes the reader off the mirror the moment the network can actually answer for the
 * screen they are looking at (REQUIREMENTS.md § 16.2.).
 *
 * INFO: A reload and never a navigation. The worker serves this document at whichever path was asked for and leaves the address bar on it, so the live screen is already at this URL — re-requesting it re-enters `serveNavigation`, which is network-first.
 *
 * WARN: Only the mirror may do this. A live screen that stayed mounted through the outage recovers on its own (§ 8.4.'s reconnect and catch-up), and reloading it would throw away the composer's draft, the queued outbox and the reader's place. The mirror has none of those — it is read-only by construction, which is the whole of why this needs no confirmation.
 */
export function useReloadWhenReachable(): void {
  useEffect(() => {
    let isProbing = false;

    async function reloadWhenReachable() {
      // WARN: The flag is checked but never trusted alone — a `true` it reports over a captive portal is exactly what the probe below is for. It is here to keep a device that is plainly offline from firing a request per foreground.
      if (isProbing || !navigator.onLine || hasReloadedRecently()) {
        return;
      }

      isProbing = true;

      try {
        // INFO: A `HEAD` of this very path, which `resolveHandler` passes straight to the network — the worker answers `GET` alone, so the probe cannot be served the cached mirror it is trying to escape.
        const response = await request(window.location.pathname, {
          method: "HEAD",
          cache: "no-store",
        });

        // WARN: `ok` rather than merely a settled response. A server that is up and failing leaves the reader better off on a readable snapshot than on its error page, and this is the one case where the mirror is the more useful of the two.
        if (response.ok) {
          markReloaded();
          window.location.reload();
        }
      } catch {
        // INFO: The network is not back after all, which is the ordinary outcome of `navigator.onLine`'s unreliable direction. `request` has already recorded the failure, so the pill stays up on the strength of it.
      } finally {
        isProbing = false;
      }
    }

    function probeWhenVisible() {
      if (document.visibilityState === "visible") {
        void reloadWhenReachable();
      }
    }

    // WARN: On mount and not only on the events below. A captive portal and a LAN with no route out both report `online` throughout, so the transition that stranded the reader here fires nothing to leave on — and the worker also serves this document for a single failed navigation over a connection that is otherwise fine. Without this probe both sit on a frozen screen with the pill already gone, saying the opposite of what the screen is.
    void reloadWhenReachable();

    window.addEventListener("online", reloadWhenReachable);
    // INFO: An iOS PWA is frozen rather than unloaded, so an `online` that fires while it is away is never delivered — the return is the only signal left.
    document.addEventListener("visibilitychange", probeWhenVisible);
    window.addEventListener("pageshow", reloadWhenReachable);

    return () => {
      window.removeEventListener("online", reloadWhenReachable);
      document.removeEventListener("visibilitychange", probeWhenVisible);
      window.removeEventListener("pageshow", reloadWhenReachable);
    };
  }, []);
}

function hasReloadedRecently(): boolean {
  const at = safelyGet(() => Number(window.sessionStorage.getItem(RELOAD_MARK))) ?? 0;

  return Date.now() - at < RELOAD_COOLDOWN;
}

function markReloaded(): void {
  safelyRun(() => window.sessionStorage.setItem(RELOAD_MARK, String(Date.now())));
}
