"use client";

import type { ChatMessage } from "@/entities/message";
import { CHAT_STREAM_PATH, SSE_RETRY_DELAY } from "@/shared/config";
import { safelyGet, type Nullable, type Optional } from "@/shared/lib";
import { useEffect, useRef } from "react";

export type UseChatStreamParams = {
  onMessage: (message: ChatMessage) => void;
  onUserChanged: () => void;
  onResume: () => void;
};

/**
 * The single `EventSource` of REQUIREMENTS.md § 8.4. — one connection carrying
 * both channels, closed while the tab is in the background so Neon's compute can
 * autosuspend, and caught up on every return.
 */
export function useChatStream({ onMessage, onUserChanged, onResume }: UseChatStreamParams) {
  // WARN: Read through a ref so a new handler identity cannot tear the connection down and reconnect it on every render.
  const handlers = useRef({ onMessage, onUserChanged, onResume });

  useEffect(() => {
    handlers.current = { onMessage, onUserChanged, onResume };
  });

  useEffect(() => {
    let source: Nullable<EventSource> = null;
    let retryTimer: Optional<ReturnType<typeof setTimeout>>;

    function open() {
      // WARN: `EventSource` retries a dropped transport on its own but gives up for good on a fatal one (a 401, a body that is not `text/event-stream`), so a `CLOSED` source is replaced rather than kept.
      if (source && source.readyState !== EventSource.CLOSED) {
        return;
      }

      source?.close();

      const opened = new EventSource(CHAT_STREAM_PATH);

      // INFO: REQUIREMENTS.md § 8.4. Every connect is a resume — a fresh source sends no `Last-Event-ID`, so nothing but this covers the gap between the server render and the socket, or the one a reconnect leaves behind.
      opened.onopen = () => {
        handlers.current.onResume();
        handlers.current.onUserChanged();
      };

      opened.onerror = () => {
        if (opened.readyState === EventSource.CLOSED) {
          scheduleReopen();
        }
      };

      opened.onmessage = (event) => {
        const message = safelyGet(() => JSON.parse(event.data) as ChatMessage);

        if (message) {
          handlers.current.onMessage(message);
        }
      };
      // WARN: A named SSE event never reaches `onmessage`; the server tags these `event: user` precisely so they stay off the message path (§ 8.4.).
      opened.addEventListener("user", () => handlers.current.onUserChanged());
      source = opened;
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
     * Component render does not re-run and cannot cover the gap. Reopening is
     * the whole handler — `onopen` above is what catches the tab up, on this
     * connect and on every reconnect alike.
     */
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        close();

        return;
      }

      open();
    }

    open();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      close();
    };
  }, []);
}
