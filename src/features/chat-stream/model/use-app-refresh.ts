"use client";

import { APP_REFRESH_RETRY_DELAY } from "@/shared/config";
import { hasUnsentWork, type Nullable, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef } from "react";

/**
 * REQUIREMENTS.md § 15.1. Reloads the document when the deployment behind the
 * stream stops being the one this page was served by.
 *
 * The signal rides the stream rather than a poll of its own because the stream
 * already reconnects on every iOS resume (§ 8.4.) — and a resume into a bundle
 * that is days old is precisely the case this exists for. A service worker cannot
 * cover it: `sw.js` deliberately caches nothing, so there is no stale cache to
 * invalidate, only a stale process to replace.
 */
export function useAppRefresh() {
  const buildId = useRef<Nullable<string>>(null);
  const isStale = useRef(false);
  const retryTimer = useRef<Optional<ReturnType<typeof setInterval>>>(undefined);

  const applyWhenIdle = useCallback(() => {
    if (!isStale.current) {
      return;
    }

    // WARN: A reload discards the composer's text, the staged attachments, and any send still in flight. Waiting costs the user a few seconds on an old bundle; not waiting costs them the message they were writing.
    if (hasUnsentWork()) {
      // INFO: An interval rather than a chain of timeouts, so the retry is armed exactly once however many times this is called while the work is outstanding.
      retryTimer.current ??= setInterval(() => {
        if (!hasUnsentWork()) {
          clearInterval(retryTimer.current);
          window.location.reload();
        }
      }, APP_REFRESH_RETRY_DELAY);

      return;
    }

    clearInterval(retryTimer.current);
    window.location.reload();
  }, []);

  const handleBuild = useCallback(
    (id: string) => {
      // INFO: The first value seen is the deployment this document came from, whatever it is — nothing is compared against a build id baked into the client, which a browser bundle cannot hold (§ 15.1.).
      if (buildId.current === null) {
        buildId.current = id;

        return;
      }

      if (buildId.current === id) {
        return;
      }

      isStale.current = true;
      applyWhenIdle();
    },
    [applyWhenIdle],
  );

  // INFO: Backgrounding is the moment unsent work is most likely to have been committed, and a reload nobody is looking at is the cheapest one there is.
  useEffect(() => {
    document.addEventListener("visibilitychange", applyWhenIdle);

    return () => {
      document.removeEventListener("visibilitychange", applyWhenIdle);
      clearInterval(retryTimer.current);
    };
  }, [applyWhenIdle]);

  return handleBuild;
}
