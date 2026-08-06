"use client";

import { TYPING_IDLE_AFTER, TYPING_PING_INTERVAL } from "@/shared/config";
import { safelyRunAsync, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef } from "react";
import { deleteTyping, postTyping } from "../api/post-typing";

/**
 * Broadcasts 입력 중 (REQUIREMENTS.md § 8.12.), and answers with the callback the
 * composer calls as the field changes — `true` while it holds something, `false`
 * the moment it is emptied or sent.
 *
 * The two sources are not the same shape and are not treated as one:
 * `isStaging` is a **state** that is either true or false right now — the
 * emoticon panel is open, an emoticon is staged — while typing is a **stream of
 * edits** with no end event of its own. Composing therefore means `isStaging ||
 * an edit within TYPING_IDLE_AFTER`.
 *
 * WARN: Never "the field is non-empty". A draft is a thing that sits there: type
 * a line, put the phone down, and an emptiness-keyed signal broadcasts 입력 중 at
 * the other person until the tab is closed.
 *
 * WARN: Clearing the field is **not** an edit that extends the signal. Deleting
 * mid-word is, but deleting the last character is the user saying they are done —
 * counted as an edit it *renews* the broadcast at the exact moment it should end.
 *
 * INFO: § 12.'s switch is not read here. It gates the broadcast in the route,
 * which is the only place that cannot go stale — a client that cached the
 * preference would keep the value it was rendered with for as long as the page
 * lives, and § 8.4. restores a frozen PWA without re-running that render.
 */
export function useTypingSignal(isStaging: boolean): (isComposing: boolean) => void {
  const lastEditAt = useRef(0);
  const lastSentAt = useRef(0);
  const isStagingRef = useRef(isStaging);
  const isBroadcasting = useRef(false);
  const pump = useRef<Optional<ReturnType<typeof setInterval>>>(undefined);

  const stopPump = useCallback(() => {
    clearInterval(pump.current);
    pump.current = undefined;
  }, []);

  /**
   * WARN: The stop is an optimization over the receiver's expiry, never a
   * replacement — a sender who is frozen, offline or killed sends none, so
   * silence has to keep working on its own (§ 8.12.).
   */
  const end = useCallback(() => {
    stopPump();
    lastEditAt.current = 0;
    // WARN: The floor is released here, and it has to be. It paces *repeats* of a signal the receiver already has — but a stop takes that signal away, so the next start is news, not a repeat. Left standing it swallows the restart for up to a full interval, and someone who clears the field and immediately types again shows as not typing while they type.
    lastSentAt.current = 0;

    // INFO: Only if the other side was actually told something. A field emptied without a ping ever going out has nothing to retract, and the DELETE would be a request answering a question nobody asked.
    if (!isBroadcasting.current) {
      return;
    }

    isBroadcasting.current = false;
    void safelyRunAsync(deleteTyping);
  }, [stopPump]);

  const tick = useCallback(() => {
    const now = Date.now();

    // INFO: The pump is what notices composing has ended, so idleness is checked here rather than watched by a timer of its own.
    if (!isStagingRef.current && now - lastEditAt.current > TYPING_IDLE_AFTER) {
      end();

      return;
    }

    // WARN: A floor on *repeats only*, kept outside the pump's own lifetime — a held backspace re-arms the loop repeatedly, and a leading edge fired fresh on each arm is a burst at the rate `TYPING_PING_INTERVAL` exists to cap. `end` releases it, because a signal that has been retracted is not one the receiver still holds.
    if (now - lastSentAt.current < TYPING_PING_INTERVAL) {
      return;
    }

    lastSentAt.current = now;
    isBroadcasting.current = true;
    void safelyRunAsync(postTyping);
  }, [end]);

  const start = useCallback(() => {
    // WARN: Never from a hidden tab. A background tab still runs this interval at the platform's once-a-minute floor, which the other participant reads as 입력 중 blinking on for eight seconds every minute, from someone who left.
    if (pump.current !== undefined || document.visibilityState !== "visible") {
      return;
    }

    tick();
    pump.current = setInterval(tick, TYPING_PING_INTERVAL);
  }, [tick]);

  const signalEdit = useCallback(
    (isComposing: boolean) => {
      // WARN: An emptied field ends the signal outright rather than lapsing into the idle window — the user watched their own text disappear and expects the other side to have stopped seeing 입력 중 by then, not four seconds later.
      if (!isComposing && !isStagingRef.current) {
        end();

        return;
      }

      if (isComposing) {
        lastEditAt.current = Date.now();
      }

      start();
    },
    [end, start],
  );

  useEffect(() => {
    isStagingRef.current = isStaging;

    // INFO: Opening the panel is itself the start — there is no edit to wait for, and the pump would otherwise never be armed by staging alone.
    if (isStaging) {
      start();

      return;
    }

    // INFO: Closing it with no recent edit behind it ends the signal now, rather than leaving the pump to notice up to one interval later.
    if (Date.now() - lastEditAt.current > TYPING_IDLE_AFTER) {
      end();
    }
  }, [isStaging, start, end]);

  useEffect(() => {
    document.addEventListener("visibilitychange", followVisibility);
    // INFO: § 8.4. iOS is inconsistent about which of these a PWA app-switch produces, so the same four the stream observes are observed here.
    window.addEventListener("pageshow", followVisibility);
    window.addEventListener("focus", followVisibility);
    window.addEventListener("pagehide", stopPump);

    return () => {
      document.removeEventListener("visibilitychange", followVisibility);
      window.removeEventListener("pageshow", followVisibility);
      window.removeEventListener("focus", followVisibility);
      window.removeEventListener("pagehide", stopPump);
      stopPump();
    };

    function followVisibility() {
      if (document.visibilityState !== "visible") {
        stopPump();

        return;
      }

      // WARN: Resumed only if composing is still true. Returning to the tab is not itself an edit, so a page restored minutes later must not announce 입력 중 for the draft it still holds.
      if (isStagingRef.current || Date.now() - lastEditAt.current <= TYPING_IDLE_AFTER) {
        start();
      }
    }
  }, [start, stopPump]);

  return signalEdit;
}
