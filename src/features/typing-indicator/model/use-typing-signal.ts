"use client";

import { TYPING_PING_INTERVAL } from "@/shared/config";
import { safelyRunAsync, type Optional } from "@/shared/lib";
import { useEffect, useRef } from "react";
import { postTyping } from "../api/post-typing";

/**
 * Broadcasts 입력 중 for as long as `isComposing` holds (REQUIREMENTS.md § 8.12.).
 *
 * WARN: One boolean, composed by the caller from every source that counts —
 * a draft, the emoticon panel, a staged emoticon. Given a signal per source they
 * would each start and stop their own ping loop, and whichever stopped last would
 * decide what the other participant saw.
 *
 * INFO: There is no stop ping. The receiver expires the indicator on silence, so
 * ceasing to send *is* the stop — and it is the only form of it that also covers
 * a sender who is killed, frozen or offline.
 *
 * INFO: § 12.'s switch is not read here. It gates the broadcast in the route,
 * which is the only place that cannot go stale — a client that cached the
 * preference would keep the value it was rendered with for as long as the page
 * lives, and § 8.4. restores a frozen PWA without re-running that render.
 */
export function useTypingSignal(isComposing: boolean) {
  // WARN: Outside the effect, so the floor survives the teardown a flickering draft causes. Held inside, deleting the last character and retyping it would rearm a fresh leading-edge ping every time — a held backspace turns into a burst of POSTs at exactly the rate `TYPING_PING_INTERVAL` exists to cap.
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!isComposing) {
      return;
    }

    let interval: Optional<ReturnType<typeof setInterval>>;

    start();
    document.addEventListener("visibilitychange", followVisibility);
    // INFO: § 8.4. iOS is inconsistent about which of these a PWA app-switch produces, so the same four the stream observes are observed here.
    window.addEventListener("pageshow", followVisibility);
    window.addEventListener("focus", followVisibility);
    window.addEventListener("pagehide", stop);

    return () => {
      document.removeEventListener("visibilitychange", followVisibility);
      window.removeEventListener("pageshow", followVisibility);
      window.removeEventListener("focus", followVisibility);
      window.removeEventListener("pagehide", stop);
      stop();
    };

    function start() {
      // WARN: Never from a hidden tab. A draft left in the field keeps `isComposing` true after the user walks away, and a background tab still runs this interval at the platform's once-a-minute floor — which the other participant reads as 입력 중 blinking on for eight seconds every minute, from someone who left.
      if (interval !== undefined || document.visibilityState !== "visible") {
        return;
      }

      ping();
      interval = setInterval(ping, TYPING_PING_INTERVAL);
    }

    function ping() {
      const now = Date.now();

      // INFO: Leading edge, so the indicator appears on the first keystroke rather than one interval into the sentence — but never closer together than the interval itself.
      if (now - lastSentAt.current < TYPING_PING_INTERVAL) {
        return;
      }

      lastSentAt.current = now;
      void safelyRunAsync(postTyping);
    }

    function stop() {
      clearInterval(interval);
      interval = undefined;
    }

    function followVisibility() {
      if (document.visibilityState === "visible") {
        start();

        return;
      }

      stop();
    }
  }, [isComposing]);
}
