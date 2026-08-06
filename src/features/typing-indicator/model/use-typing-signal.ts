"use client";

import { TYPING_IDLE_AFTER, TYPING_PING_INTERVAL } from "@/shared/config";
import { safelyRunAsync, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef } from "react";
import { postTyping } from "../api/post-typing";

/**
 * Broadcasts 입력 중 (REQUIREMENTS.md § 8.12.), and answers with the callback the
 * composer calls on every edit.
 *
 * The two sources are not the same shape and are not treated as one:
 * `isStaging` is a **state** that is either true or false right now — the
 * emoticon panel is open, an emoticon is staged — while typing is a **stream of
 * edits** with no end event of its own. Composing therefore means `isStaging ||
 * an edit within TYPING_IDLE_AFTER`.
 *
 * WARN: Never "the field is non-empty". A draft is a thing that sits there: type
 * a line, put the phone down, and an emptiness-keyed signal broadcasts 입력 중 at
 * the other person until the tab is closed. Deleting counts as an edit for the
 * same reason typing does — the user is at the keyboard either way.
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
export function useTypingSignal(isStaging: boolean): () => void {
  const lastEditAt = useRef(0);
  const lastSentAt = useRef(0);
  const isStagingRef = useRef(isStaging);
  const pump = useRef<Optional<ReturnType<typeof setInterval>>>(undefined);

  const stop = useCallback(() => {
    clearInterval(pump.current);
    pump.current = undefined;
  }, []);

  const tick = useCallback(() => {
    const now = Date.now();

    // INFO: The pump is what notices composing has ended, so idleness is checked here rather than watched by a timer of its own.
    if (!isStagingRef.current && now - lastEditAt.current > TYPING_IDLE_AFTER) {
      stop();

      return;
    }

    // WARN: The floor is kept outside the pump's own lifetime. A held backspace re-arms the loop repeatedly, and a leading edge fired fresh on each arm is a burst at exactly the rate `TYPING_PING_INTERVAL` exists to cap.
    if (now - lastSentAt.current < TYPING_PING_INTERVAL) {
      return;
    }

    lastSentAt.current = now;
    void safelyRunAsync(postTyping);
  }, [stop]);

  const start = useCallback(() => {
    // WARN: Never from a hidden tab. A background tab still runs this interval at the platform's once-a-minute floor, which the other participant reads as 입력 중 blinking on for eight seconds every minute, from someone who left.
    if (pump.current !== undefined || document.visibilityState !== "visible") {
      return;
    }

    tick();
    pump.current = setInterval(tick, TYPING_PING_INTERVAL);
  }, [tick]);

  const signalEdit = useCallback(() => {
    lastEditAt.current = Date.now();
    start();
  }, [start]);

  useEffect(() => {
    isStagingRef.current = isStaging;

    // INFO: Opening the panel is itself the start — there is no edit to wait for, and the pump would otherwise never be armed by staging alone.
    if (isStaging) {
      start();
    }
  }, [isStaging, start]);

  useEffect(() => {
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

    function followVisibility() {
      if (document.visibilityState !== "visible") {
        stop();

        return;
      }

      // WARN: Resumed only if composing is still true. Returning to the tab is not itself an edit, so a page restored minutes later must not announce 입력 중 for the draft it still holds.
      if (isStagingRef.current || Date.now() - lastEditAt.current <= TYPING_IDLE_AFTER) {
        start();
      }
    }
  }, [start, stop]);

  return signalEdit;
}
