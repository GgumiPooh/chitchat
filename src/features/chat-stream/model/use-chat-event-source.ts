"use client";

import type { ChatMessage } from "@/entities/message";
import {
  BACKFILL_EVENT,
  CHAT_STREAM_PATH,
  IS_SSE_IDLE_SLEEP_ENABLED,
  SSE_BLUR_IDLE_TIMEOUT,
  SSE_IDLE_TIMEOUT,
  SSE_RETRY_DELAY,
  SSE_STALE_AFTER,
  SSE_SYNC_COALESCE_WINDOW,
  typingEventSchema,
  type MessageArrival,
} from "@/shared/config";
import { isBusy, safelyGet, type Nullable, type Optional } from "@/shared/lib";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

export type ChatEventSourceHandlers = {
  onMessage: (message: ChatMessage, arrival: MessageArrival) => void;
  onUserChanged: () => void;
  onResume: () => void;
  /** Someone started or stopped composing. REQUIREMENTS.md § 8.12. */
  onTyping: (userId: string, isTyping: boolean) => void;
  /** The deployment serving this connection. REQUIREMENTS.md § 15.1. */
  onBuild: (id: string) => void;
  /** The stream went dormant, or came back. REQUIREMENTS.md § 8.4.1. */
  onDormancyChange: (isDormant: boolean) => void;
};

const buildSchema = z.object({ id: z.string().min(1) });

export type ChatEventSourceState = {
  /** REQUIREMENTS.md § 8.4.1. The stream was dropped for idleness and only `wake` brings it back. */
  isDormant: boolean;
  wake: () => void;
};

/**
 * The single `EventSource` of REQUIREMENTS.md § 8.4. — one connection carrying
 * both channels, closed while the tab is in the background so Neon's compute can
 * autosuspend, and caught up on every return.
 *
 * INFO: § 8.4.1. It is also dropped after an idle stretch, which is the only thing
 * that reaches a desktop PWA left open behind another window — that window is never
 * `hidden`, so the background close above never fires for it.
 */
export function useChatEventSource({
  onMessage,
  onUserChanged,
  onResume,
  onTyping,
  onBuild,
  onDormancyChange,
}: ChatEventSourceHandlers): ChatEventSourceState {
  // WARN: Read through a ref so a new handler identity cannot tear the connection down and reconnect it on every render.
  const handlers = useRef({
    onMessage,
    onUserChanged,
    onResume,
    onTyping,
    onBuild,
    onDormancyChange,
  });
  const [isDormant, setIsDormant] = useState(false);
  // WARN: The effect below runs once and owns the connection, so the only way out of dormancy is a function it publishes here. Rebuilding the effect to expose one would tear the stream down on every wake.
  const leaveDormancy = useRef(() => undefined as void);
  const wake = useCallback(() => leaveDormancy.current(), []);

  useEffect(() => {
    handlers.current = { onMessage, onUserChanged, onResume, onTyping, onBuild, onDormancyChange };
  });

  useEffect(() => {
    let source: Nullable<EventSource> = null;
    let retryTimer: Optional<ReturnType<typeof setTimeout>>;
    let idleTimer: Optional<ReturnType<typeof setTimeout>>;
    let lastSyncAt = 0;
    let lastActivityAt = 0;
    let lastInteractionAt = Date.now();
    // WARN: § 8.4.1. A floor the countdown may not undercut, pushed out by a blur. Without it a window idle past the blur allowance sleeps on the same tick it loses focus, and the grace the allowance exists to give is never served.
    let sleepNotBefore = 0;
    let isSleeping = false;

    function open() {
      // INFO: § 8.4.1. Dormancy outranks every reopen path — the retry, the resume and the visibility handler all route through here, and only `wake` clears it.
      if (isSleeping) {
        return;
      }

      // WARN: `EventSource` retries a dropped transport on its own but gives up for good on a fatal one (a 401, a body that is not `text/event-stream`), so a `CLOSED` source is replaced rather than kept.
      if (source && source.readyState !== EventSource.CLOSED) {
        return;
      }

      source?.close();

      const opened = new EventSource(CHAT_STREAM_PATH);

      // INFO: REQUIREMENTS.md § 8.4. Every connect is a resume — a fresh source sends no `Last-Event-ID`, so nothing but this covers the gap between the server render and the socket, or the one a reconnect leaves behind.
      opened.onopen = () => {
        markAlive();
        sync();
      };

      opened.onerror = () => {
        if (opened.readyState === EventSource.CLOSED) {
          scheduleReopen();
        }
      };

      opened.onmessage = (event) => deliver(event, "live");
      // INFO: REQUIREMENTS.md § 8.4. The reconnect replay, on its own event name — same rows, same `id:` cursor, but nothing here is news to the screen (§ 13.6.).
      opened.addEventListener(BACKFILL_EVENT, (event) => deliver(event, "backfill"));
      // WARN: A named SSE event never reaches `onmessage`; the server tags these `event: user` precisely so they stay off the message path (§ 8.4.).
      opened.addEventListener("user", () => {
        markAlive();
        handlers.current.onUserChanged();
      });
      // INFO: REQUIREMENTS.md § 8.12. Never replayed and never caught up on — a signal that meant "right now" ten seconds ago is not news, so a reconnect deliberately arrives knowing nothing.
      opened.addEventListener("typing", (event) => {
        markAlive();

        const typing = typingEventSchema.safeParse(safelyGet(() => JSON.parse(event.data)));

        if (typing.success) {
          handlers.current.onTyping(typing.data.userId, typing.data.isTyping);
        }
      });
      // INFO: REQUIREMENTS.md § 8.4. The heartbeat is a named event rather than a `:ping` comment so it lands here — this is the client's only evidence that the socket underneath is still real.
      opened.addEventListener("ping", markAlive);
      // INFO: REQUIREMENTS.md § 15.1. Sent once per connection, before the replay.
      opened.addEventListener("build", (event) => {
        markAlive();

        const build = buildSchema.safeParse(safelyGet(() => JSON.parse(event.data)));

        if (build.success) {
          handlers.current.onBuild(build.data.id);
        }
      });
      source = opened;
      // WARN: Dated from the connect, not from `onopen` — otherwise a resume arriving before the socket is up reads a never-alive source as the dead one below and tears down a connection that is merely still connecting.
      markAlive();
    }

    function markAlive() {
      lastActivityAt = Date.now();
    }

    function deliver(event: MessageEvent<string>, arrival: MessageArrival) {
      markAlive();

      const message = safelyGet(() => JSON.parse(event.data) as ChatMessage);

      if (message) {
        handlers.current.onMessage(message, arrival);
      }
    }

    /** REQUIREMENTS.md § 8.4. Coalesced, since one iOS resume fires several of the events below. */
    function sync() {
      const now = Date.now();

      if (now - lastSyncAt < SSE_SYNC_COALESCE_WINDOW) {
        return;
      }

      lastSyncAt = now;
      handlers.current.onResume();
      handlers.current.onUserChanged();
    }

    function scheduleReopen() {
      if (retryTimer !== undefined) {
        return;
      }

      retryTimer = setTimeout(() => {
        retryTimer = undefined;

        // INFO: A backgrounded tab holds no stream on purpose (§ 8.4.); returning to it opens one through the visibility handler.
        if (document.visibilityState === "visible") {
          open();
        }
      }, SSE_RETRY_DELAY);
    }

    function close() {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      source?.close();
      source = null;
    }

    /**
     * REQUIREMENTS.md § 8.4. Resume is the normal sync path. An iOS home-screen
     * PWA restores the frozen page instead of navigating, so the Server
     * Component render does not re-run and cannot cover the gap.
     */
    function resume() {
      // INFO: § 8.4.1. A dormant client syncs nothing either — the catch-up below is several requests, and running them for a screen nobody has come back to is the cost this state exists to avoid.
      if (isSleeping) {
        return;
      }

      // INFO: § 8.4.1. Returning to the window counts as touching it, which is also what keeps a timer armed before an iOS freeze from coming due the moment the page is restored.
      noteInteraction();

      // WARN: The catch-up runs before the socket, never through it. `onopen` alone would strand the screen on stale messages for as long as the reconnect takes — and forever if it never lands.
      sync();

      if (isDead()) {
        close();
      }

      open();
    }

    // WARN: A restored iOS page keeps its `EventSource` at `readyState === OPEN` over a socket the system already closed, and a zombie like that emits no `error` for `open()`'s guard or the retry to act on. Silence past the heartbeat is what unmasks it (§ 8.4.).
    function isDead() {
      return source !== null && Date.now() - lastActivityAt > SSE_STALE_AFTER;
    }

    /** REQUIREMENTS.md § 8.4.1. A blurred window runs the shorter countdown — nobody is reading it. */
    function idleAllowance() {
      return document.hasFocus() ? SSE_IDLE_TIMEOUT : SSE_BLUR_IDLE_TIMEOUT;
    }

    function noteInteraction() {
      lastInteractionAt = Date.now();

      if (!isSleeping) {
        armIdleTimer();
      }
    }

    // INFO: § 8.4.1. Every path into dormancy — the first arm, an interaction, a blur, a resume — goes through here, so the kill switch only has to be honoured once.
    function armIdleTimer() {
      if (!IS_SSE_IDLE_SLEEP_ENABLED) {
        return;
      }

      clearTimeout(idleTimer);
      idleTimer = setTimeout(sleep, Math.max(sleepAt() - Date.now(), 0));
    }

    // WARN: § 8.4.1. The remaining allowance, not a fresh one — a blur re-arms without being an interaction, and a full countdown handed to it would let a window idle for 50 seconds and then leave the screen buy itself another 30.
    function sleepAt() {
      return Math.max(lastInteractionAt + idleAllowance(), sleepNotBefore);
    }

    /**
     * WARN: The deadline is re-derived from the clock rather than trusted to the
     * timer that fired. A frozen PWA runs no timers, so one armed before the freeze
     * comes due the instant the page is restored — and would put the § 8.4.1.
     * overlay in front of a user who has just this moment come back.
     */
    function sleep() {
      const remaining = sleepAt() - Date.now();

      if (remaining > 0) {
        idleTimer = setTimeout(sleep, remaining);

        return;
      }

      // WARN: § 8.4.1. A tab opened in the background starts `hidden` and fires no `visibilitychange` until it is first looked at, so the disarm below never runs for it — checked here too, or the first thing that tab ever shows is the overlay.
      if (document.visibilityState !== "visible") {
        idleTimer = undefined;

        return;
      }

      // INFO: § 8.4.1. A recording, a playing clip or an open sheet is a task in flight, and the overlay would cover its controls — so the countdown simply runs again.
      if (isBusy()) {
        idleTimer = setTimeout(sleep, idleAllowance());

        return;
      }

      isSleeping = true;
      clearTimeout(idleTimer);
      idleTimer = undefined;
      close();
      setIsDormant(true);
      handlers.current.onDormancyChange(true);
    }

    // INFO: § 8.4.1. The one way out, and it is always a deliberate act — returning focus does not qualify, or the overlay would be dismissed by the very switch that is meant to reveal it.
    function awaken() {
      if (!isSleeping) {
        return;
      }

      isSleeping = false;
      setIsDormant(false);
      handlers.current.onDormancyChange(false);
      resume();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // WARN: § 8.4.1. Disarmed, never left to expire. A backgrounded app has already dropped the stream and costs nothing, so letting the countdown finish underneath would put the overlay in front of every app switch longer than a minute and buy nothing at all.
        clearTimeout(idleTimer);
        idleTimer = undefined;
        close();

        return;
      }

      resume();
    }

    // INFO: § 8.4.1. `blur` has no counterpart in § 8.4. — a desktop PWA behind another window stays `visible`, so this is the only event that sees it go away.
    function handleBlur() {
      if (isSleeping) {
        return;
      }

      // WARN: § 8.4.1. A floor, not a reset. Reading a message is not an interaction here, so a window already idle past the blur allowance would otherwise sleep on the very tick it loses focus — the grace this allowance exists to give has to survive that.
      sleepNotBefore = Date.now() + SSE_BLUR_IDLE_TIMEOUT;
      armIdleTimer();
    }

    // INFO: § 8.4.1. A key wakes as a tap does. Focus is usually still in the composer when the overlay arrives, so without this the keystrokes that follow go into a field the user can no longer see and nothing reconnects.
    function handleKeyDown() {
      if (isSleeping) {
        awaken();

        return;
      }

      noteInteraction();
    }

    open();
    armIdleTimer();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // INFO: § 8.4. iOS is inconsistent about which of these a PWA app-switch produces, so all three are observed and `sync` coalesces the duplicates.
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", close);
    window.addEventListener("blur", handleBlur);
    // WARN: § 8.4.1. `pointerdown` and `keydown` only. `mousemove` and `scroll` would hand the countdown to a cursor crossing the window and to momentum the user is not driving, which is most of what this is meant to catch.
    document.addEventListener("pointerdown", noteInteraction);
    document.addEventListener("keydown", handleKeyDown);
    leaveDormancy.current = awaken;

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("pointerdown", noteInteraction);
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(idleTimer);
      close();
      // WARN: § 8.4.1. The provider outlives this hook, so a dormancy left standing here is one nothing ever takes back down — leaving 채팅 while the overlay is up would strand it believing the conversation is still asleep.
      handlers.current.onDormancyChange(false);
    };
  }, []);

  return { isDormant, wake };
}
