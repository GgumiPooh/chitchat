"use client";

import type { ChatMessage } from "@/entities/message";
import {
  CHAT_STREAM_PATH,
  SSE_RETRY_DELAY,
  SSE_STALE_AFTER,
  SSE_SYNC_COALESCE_WINDOW,
} from "@/shared/config";
import { safelyGet, type Nullable, type Optional } from "@/shared/lib";
import { useEffect, useRef } from "react";

export type ChatEventSourceHandlers = {
  onMessage: (message: ChatMessage) => void;
  onUserChanged: () => void;
  onResume: () => void;
};

/**
 * The single `EventSource` of REQUIREMENTS.md § 8.4. — one connection carrying
 * both channels, closed while the tab is in the background so Neon's compute can
 * autosuspend, and caught up on every return.
 */
export function useChatEventSource({
  onMessage,
  onUserChanged,
  onResume,
}: ChatEventSourceHandlers) {
  // WARN: Read through a ref so a new handler identity cannot tear the connection down and reconnect it on every render.
  const handlers = useRef({ onMessage, onUserChanged, onResume });

  useEffect(() => {
    handlers.current = { onMessage, onUserChanged, onResume };
  });

  useEffect(() => {
    let source: Nullable<EventSource> = null;
    let retryTimer: Optional<ReturnType<typeof setTimeout>>;
    let lastSyncAt = 0;
    let lastActivityAt = 0;

    function open() {
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

      opened.onmessage = (event) => {
        markAlive();

        const message = safelyGet(() => JSON.parse(event.data) as ChatMessage);

        if (message) {
          handlers.current.onMessage(message);
        }
      };
      // WARN: A named SSE event never reaches `onmessage`; the server tags these `event: user` precisely so they stay off the message path (§ 8.4.).
      opened.addEventListener("user", () => {
        markAlive();
        handlers.current.onUserChanged();
      });
      // INFO: REQUIREMENTS.md § 8.4. The heartbeat is a named event rather than a `:ping` comment so it lands here — this is the client's only evidence that the socket underneath is still real.
      opened.addEventListener("ping", markAlive);
      source = opened;
      // WARN: Dated from the connect, not from `onopen` — otherwise a resume arriving before the socket is up reads a never-alive source as the dead one below and tears down a connection that is merely still connecting.
      markAlive();
    }

    function markAlive() {
      lastActivityAt = Date.now();
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

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        close();

        return;
      }

      resume();
    }

    open();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // INFO: § 8.4. iOS is inconsistent about which of these a PWA app-switch produces, so all three are observed and `sync` coalesces the duplicates.
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", close);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pagehide", close);
      close();
    };
  }, []);
}
