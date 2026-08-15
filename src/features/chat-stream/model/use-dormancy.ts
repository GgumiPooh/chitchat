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
  /** § 8.4.1. Whether that sleep is on screen. Only one the reader can see wears 절전 모드. */
  isDormantVisible: boolean;
  wake: () => void;
};

/**
 * REQUIREMENTS.md § 8.4.1. 절전 모드 — the countdown, the departure, and the ways
 * out.
 *
 * It lives in the shell rather than beside the socket so that its listeners are
 * registered before any other, but it sleeps only while the conversation is on
 * screen: that stream is the whole of what an idle client costs, and the other
 * three tabs poll nothing to be stopped from doing.
 *
 * WARN: Mount this before any other listener that fires on `blur` or
 * `visibilitychange`. Effects run in declaration order, so being first is what puts
 * the gate shut before the read-cursor flush in `ChatStreamProvider` reads it.
 */
export function useDormancy(isRoomOnScreen: boolean): DormancyState {
  const [isDormant, setIsDormant] = useState(false);
  const [isDormantVisible, setIsDormantVisible] = useState(false);
  // WARN: The effect below runs once and owns the machine, so the only way out is a function it publishes here. Rebuilding the effect to expose one would re-arm the countdown on every wake.
  const leaveDormancy = useRef(() => undefined as void);
  const holdRoom = useRef<(isOnScreen: boolean) => void>(() => undefined);
  const roomRef = useRef(isRoomOnScreen);
  const wake = useCallback(() => leaveDormancy.current(), []);

  useEffect(() => {
    let idleTimer: Optional<ReturnType<typeof setTimeout>>;
    let lastInteractionAt = Date.now();
    let isSleeping = false;
    let isShowing = false;

    function noteInteraction() {
      lastInteractionAt = Date.now();

      if (!isSleeping) {
        armIdleTimer();
      }
    }

    // INFO: § 8.4.1. Every path into dormancy — the first arm, an interaction, a departure — goes through here, so the kill switch only has to be honoured once.
    function armIdleTimer(delay = Math.max(lastInteractionAt + SSE_IDLE_TIMEOUT - Date.now(), 0)) {
      if (!IS_SSE_IDLE_SLEEP_ENABLED || !roomRef.current) {
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

      // WARN: § 8.4.1. The overlay belongs to a window the reader is in front of. A page resumed from a freeze runs this same timer long past its deadline, and it has focus — only one still sitting behind another window does not.
      if (isSleeping && document.hasFocus()) {
        idleTimer = undefined;

        return;
      }

      // INFO: § 8.4.1. A recording, a playing clip, an open sheet or a send still in flight is a task the overlay would cover — so the countdown simply runs again.
      if (isBusy()) {
        armIdleTimer(SSE_BUSY_RECHECK_INTERVAL);

        return;
      }

      revealDormancy();
    }

    /**
     * REQUIREMENTS.md § 8.4.1. The request gate, shut by whatever led here — an idle
     * stretch, a window left, or the app backgrounded.
     *
     * WARN: The shared flag is written before the React state, and synchronously.
     * Later listeners on the same event read it to decide whether to send, so a
     * flag deferred to the render would let the very departure that goes dormant
     * fire the requests dormancy exists to stop.
     */
    function enterDormancy() {
      // WARN: § 8.4.1. The kill switch is honoured here rather than in `armIdleTimer` alone. It governed only the countdown before, which was survivable while dormancy closed a socket — with the request gate behind it, an environment that had switched this off would still have every departure stop the app talking to the server.
      if (isSleeping || !IS_SSE_IDLE_SLEEP_ENABLED || !roomRef.current) {
        return;
      }

      isSleeping = true;
      setDormant(true);
      setIsDormant(true);
    }

    /**
     * REQUIREMENTS.md § 8.4.1. The half the reader sees, and it is raised by the
     * countdown alone — a departure leaves no one in front of the screen to explain
     * the silence to, and the overlay it used to raise was still standing in the
     * app-switcher snapshot when they came back.
     */
    function revealDormancy() {
      enterDormancy();

      if (!isSleeping || isShowing) {
        return;
      }

      isShowing = true;
      setDormant(true, true);
      setIsDormantVisible(true);
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }

    /**
     * REQUIREMENTS.md § 8.4.1. Takes the overlay down without ending the sleep, for
     * the app going away underneath it.
     *
     * WARN: The overlay is a visible window's state and nothing else. Left standing
     * it is painted into iOS's app-switcher snapshot, and the reader comes back to
     * a 절전 모드 they never watched arrive — which the silent departure below exists
     * to have removed.
     */
    function concealDormancy() {
      if (!isShowing) {
        return;
      }

      isShowing = false;
      setDormant(true, false);
      setIsDormantVisible(false);
    }

    // INFO: § 8.4.1. A silent sleep ends by itself; only the overlay has to be pressed off, and only because it is standing in front of somebody.
    function awaken() {
      if (!isSleeping) {
        return;
      }

      isSleeping = false;
      isShowing = false;
      setDormant(false);
      setIsDormant(false);
      setIsDormantVisible(false);
      noteInteraction();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        leave();
        concealDormancy();
        // WARN: § 8.4.1. A frozen page runs no timers, so one left armed here comes due on the resume — where `hasFocus` above is the only thing between it and an overlay raised on a reader who has just come back.
        clearTimeout(idleTimer);
        idleTimer = undefined;

        return;
      }

      handleReturn();
    }

    /**
     * REQUIREMENTS.md § 8.4.1. Coming back ends the sleep, overlay or no overlay.
     *
     * WARN: This once refused to wake a *visible* sleep, on the reasoning that the
     * reader had watched it arrive. They had not: a window fully behind another is
     * still `visible`, so the overlay the countdown raises there is one nobody saw,
     * and ⌘Tab back to it asked for a press to dismiss what the return had already
     * answered. What still needs a press is a window that never lost focus, which
     * reaches no branch here.
     *
     * WARN: Returning also re-arms the countdown, and something has to — `sleep`
     * disarms itself outright when it comes due on a window nobody has looked at.
     * `awaken` notes an interaction of its own, so this is idempotent within a tick.
     */
    function handleReturn() {
      if (document.visibilityState !== "visible") {
        return;
      }

      awaken();
      noteInteraction();
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
     * WARN: § 8.4.1. A task in flight departs without going dormant. § 8.5.'s
     * delivery queue would lose the rest of its chain to a closed request gate, and
     * on iOS a file picker and the share sheet both take focus away mid-task.
     */
    function leave() {
      if (isBusy()) {
        return;
      }

      enterDormancy();
    }

    /**
     * REQUIREMENTS.md § 8.4.1. Entering 채팅 starts the countdown and leaving ends
     * it, because the stream it exists to close is open for exactly that long.
     */
    function holdForRoom(isOnScreen: boolean) {
      roomRef.current = isOnScreen;

      if (isOnScreen) {
        noteInteraction();

        return;
      }

      awaken();
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }

    // WARN: § 8.4.1. A tap wakes a silent sleep rather than merely noting it. The overlay is what a press lands on when there is one, and when there is none the press must not fall onto a shut gate.
    function handlePointerDown() {
      if (isSleeping && !isShowing) {
        awaken();

        return;
      }

      noteInteraction();
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
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    leaveDormancy.current = awaken;
    holdRoom.current = holdForRoom;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pageshow", handleReturn);
      window.removeEventListener("focus", handleReturn);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(idleTimer);
      // WARN: The flag outlives React, so a teardown that left it set would refuse every request for the rest of the document's life — including the ones a fresh mount makes.
      setDormant(false);
    };
  }, []);

  /**
   * WARN: A second effect rather than a dependency on the one above, which must
   * keep the listener order its own comment describes — re-running it here would
   * re-register its handlers behind the read-cursor flush that departs beside them.
   */
  useEffect(() => holdRoom.current(isRoomOnScreen), [isRoomOnScreen]);

  return { isDormant, isDormantVisible, wake };
}
