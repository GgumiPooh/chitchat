"use client";

import {
  IS_SSE_IDLE_SLEEP_ENABLED,
  SSE_BUSY_RECHECK_INTERVAL,
  SSE_IDLE_TIMEOUT,
} from "@/shared/config";
import { isBusy, setDormant, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";

// INFO: REQUIREMENTS.md § 8.4.1. Keys that are never a keystroke on their own — pressing one is the first half of a shortcut, not typing.
const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "CapsLock"]);

export type DormancyState = {
  /** REQUIREMENTS.md § 8.4.1. The app is asleep and reaching our API is refused. */
  isDormant: boolean;
  wake: () => void;
};

/**
 * REQUIREMENTS.md § 8.4.1. 절전 모드 — the countdown, the departure, and the one
 * way out.
 *
 * It lives in the shell rather than beside the socket, because dormancy closes the
 * request gate for the **whole** app (`shared/api`): 캘린더, 보관함 and 설정 hold no
 * `EventSource` and would otherwise keep waking Neon on every resume with nothing
 * on screen to show for it.
 *
 * WARN: Mount this before any other listener that fires on `blur` or
 * `visibilitychange`. Effects run in declaration order, so being first is what puts
 * the gate shut before the read-cursor flush in `ChatStreamProvider` reads it.
 */
export function useDormancy(): DormancyState {
  const [isDormant, setIsDormant] = useState(false);
  // WARN: The effect below runs once and owns the machine, so the only way out is a function it publishes here. Rebuilding the effect to expose one would re-arm the countdown on every wake.
  const leaveDormancy = useRef(() => undefined as void);
  const wake = useCallback(() => leaveDormancy.current(), []);

  useEffect(() => {
    let idleTimer: Optional<ReturnType<typeof setTimeout>>;
    let lastInteractionAt = Date.now();
    let isSleeping = false;

    function noteInteraction() {
      lastInteractionAt = Date.now();

      if (!isSleeping) {
        armIdleTimer();
      }
    }

    // INFO: § 8.4.1. Every path into dormancy — the first arm, an interaction, a departure — goes through here, so the kill switch only has to be honoured once.
    function armIdleTimer(delay = Math.max(lastInteractionAt + SSE_IDLE_TIMEOUT - Date.now(), 0)) {
      if (!IS_SSE_IDLE_SLEEP_ENABLED) {
        return;
      }

      clearTimeout(idleTimer);
      idleTimer = setTimeout(sleep, delay);
    }

    /**
     * WARN: The deadline is re-derived from the clock rather than trusted to the
     * timer that fired. A frozen PWA runs no timers, so one armed before the freeze
     * comes due the instant the page is restored — and would put the overlay in
     * front of a user who has just this moment come back.
     */
    function sleep() {
      const remaining = lastInteractionAt + SSE_IDLE_TIMEOUT - Date.now();

      if (remaining > 0) {
        idleTimer = setTimeout(sleep, remaining);

        return;
      }

      // WARN: § 8.4.1. A tab opened in the background starts `hidden` and fires no `visibilitychange` until it is first viewed, so nothing else would stop the countdown going dormant unseen and greeting its first viewer with the overlay.
      if (document.visibilityState !== "visible") {
        idleTimer = undefined;

        return;
      }

      // INFO: § 8.4.1. A recording, a playing clip, an open sheet or a send still in flight is a task the overlay would cover — so the countdown simply runs again.
      if (isBusy()) {
        armIdleTimer(SSE_BUSY_RECHECK_INTERVAL);

        return;
      }

      enterDormancy();
    }

    /**
     * REQUIREMENTS.md § 8.4.1. The one transition into 절전 모드, whatever led here —
     * an idle stretch, a window left, or the app backgrounded.
     *
     * WARN: The shared flag is written before the React state, and synchronously.
     * Later listeners on the same event read it to decide whether to send, so a
     * flag deferred to the render would let the very departure that goes dormant
     * fire the requests dormancy exists to stop.
     */
    function enterDormancy() {
      // WARN: § 8.4.1. The kill switch is honoured here rather than in `armIdleTimer` alone. It governed only the countdown before, which was survivable while dormancy closed a socket — with the request gate behind it, an environment that had switched this off would still have every departure stop the app talking to the server.
      if (isSleeping || !IS_SSE_IDLE_SLEEP_ENABLED) {
        return;
      }

      isSleeping = true;
      setDormant(true);
      clearTimeout(idleTimer);
      idleTimer = undefined;
      setIsDormant(true);
    }

    // INFO: § 8.4.1. The one way out, and it is always a deliberate act — returning focus does not qualify, or the overlay would be dismissed by the very switch that is meant to reveal it.
    function awaken() {
      if (!isSleeping) {
        return;
      }

      isSleeping = false;
      setDormant(false);
      setIsDormant(false);
      noteInteraction();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        leave();

        return;
      }

      noteInteraction();
    }

    /**
     * WARN: § 8.4.1. Returning re-arms the countdown, and something has to — `sleep`
     * disarms itself outright when it comes due on a window nobody has looked at,
     * so without this the only thing left that could re-arm is a `pointerdown` or a
     * `keydown`. A departure that skipped dormancy through `isBusy` (a clip
     * playing) and came back to a reader who touches nothing would then never go
     * dormant again for the life of the page.
     *
     * INFO: This does not wake. `noteInteraction` writes the deadline but leaves
     * `isSleeping` alone, so returning focus still fails to dismiss the overlay —
     * which is the § 8.4.1. rule it would otherwise break.
     */
    function handleReturn() {
      if (document.visibilityState === "visible") {
        noteInteraction();
      }
    }

    /**
     * REQUIREMENTS.md § 8.4.1. `blur` has no counterpart in § 8.4. — a desktop PWA
     * behind another window stays `visible`, so this is the only event that sees
     * that one go away.
     */
    function handleBlur() {
      leave();
    }

    /**
     * WARN: § 8.4.1. A task in flight departs without going dormant. The overlay
     * would cover the controls of a recording or an open sheet, on iOS a file
     * picker and the share sheet both take focus away mid-task, and § 8.5.'s
     * delivery queue would lose the rest of its chain to a closed request gate.
     */
    function leave() {
      if (isBusy()) {
        return;
      }

      enterDormancy();
    }

    // INFO: § 8.4.1. A key wakes as a tap does. Focus is usually still in the composer when the overlay arrives, so without this the keystrokes that follow go into a field the user can no longer see and nothing reconnects.
    function handleKeyDown(event: KeyboardEvent) {
      if (isSleeping) {
        if (isTypingKey(event)) {
          awaken();
        }

        return;
      }

      // INFO: Unfiltered here. `Cmd+C` in the composer is a user plainly at the keyboard, and a shortcut that is a departure is caught by the `blur` above instead.
      noteInteraction();
    }

    /**
     * WARN: § 8.4.1. `Cmd` reaches the page before focus leaves it, so waking on
     * any key at all meant `Cmd+Tab` — a departure — woke the app on the way out.
     * Only a keystroke that would have put a character on screen counts.
     */
    function isTypingKey(event: KeyboardEvent) {
      return !MODIFIER_KEYS.has(event.key) && !event.metaKey && !event.ctrlKey && !event.altKey;
    }

    armIdleTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    // INFO: § 8.4. iOS is inconsistent about which of these a PWA app-switch produces, so both are observed; `noteInteraction` is idempotent within a tick.
    window.addEventListener("pageshow", handleReturn);
    window.addEventListener("focus", handleReturn);
    // WARN: § 8.4.1. `pointerdown` and `keydown` only. `mousemove` and `scroll` would hand the countdown to a cursor crossing the window and to momentum the user is not driving, which is most of what this is meant to catch.
    document.addEventListener("pointerdown", noteInteraction);
    document.addEventListener("keydown", handleKeyDown);
    leaveDormancy.current = awaken;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pageshow", handleReturn);
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("pointerdown", noteInteraction);
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(idleTimer);
      // WARN: The flag outlives React, so a teardown that left it set would refuse every request for the rest of the document's life — including the ones a fresh mount makes.
      setDormant(false);
    };
  }, []);

  return { isDormant, wake };
}
