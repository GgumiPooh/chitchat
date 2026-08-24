"use client";

import { MAX_MESSAGE_LENGTH, SHARE_TARGET_PARAMS } from "@/shared/config";
import { useEffect, useRef } from "react";

/**
 * REQUIREMENTS.md § 7. Sends what Android's or Windows' share sheet launched the
 * app with, which arrives as query parameters on `CHAT_ROUTE` itself.
 *
 * WARN: The parameters are stripped **before** the send, and that is the whole of
 * the duplicate defence — a reload, a bfcache restore or a StrictMode second pass
 * re-runs this against a URL that no longer carries a share.
 *
 * WARN: A task later rather than in the mount effect itself, or the strip reaches
 * the **native** `replaceState`: `AppRouter` patches that method in a passive effect
 * of its own, and a child's flushes first. Unpatched, the router keeps `?text=` as
 * its canonical URL and `HistoryUpdater` writes it back over the address bar at the
 * next state change — re-arming this send for the following launch.
 */
export function useShareTarget(onShared: (text: string) => void) {
  const handlerRef = useRef(onShared);

  useEffect(() => {
    handlerRef.current = onShared;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      const shared = toSharedText(url.searchParams);

      if (!shared) {
        return;
      }

      Object.values(SHARE_TARGET_PARAMS).forEach((name) => url.searchParams.delete(name));
      window.history.replaceState(null, "", `${url.pathname}${url.search}`);

      handlerRef.current(shared);
    });

    return () => clearTimeout(timer);
  }, []);
}

/**
 * INFO: § 7. Each sharing app fills a different subset — a title repeated inside
 * `text`, a URL in both — so a part any other one contains is dropped rather than
 * repeated, and `SHARE_TARGET_PARAMS`' order decides what survives a tie.
 *
 * WARN: Truncated to what § 6. stores. `POST /api/messages` refuses a longer body
 * with a 400, which this path has no composer to report in — a shared article
 * selection would land as a § 8.5. failed bubble with no route to success.
 */
function toSharedText(params: URLSearchParams): string {
  const parts = Object.values(SHARE_TARGET_PARAMS)
    .map((name) => params.get(name)?.trim())
    .filter((value): value is string => Boolean(value));

  return parts
    .filter(
      (value, index) =>
        !parts.some(
          (other, otherIndex) =>
            otherIndex !== index &&
            other.includes(value) &&
            (other.length > value.length || otherIndex < index),
        ),
    )
    .join("\n")
    .slice(0, MAX_MESSAGE_LENGTH);
}
