"use client";

import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { updateAppBadge } from "@/shared/badge";
import { READ_CURSOR_THROTTLE, type MessageArrival } from "@/shared/config";
import { safelyGetAsync, safelyRunAsync, type Nullable } from "@/shared/lib";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { fetchParticipants } from "../api/fetch-participants";
import { fetchUnreadCount } from "../api/fetch-unread-count";
import { postRead } from "../api/post-read";
import { useAppRefresh } from "./use-app-refresh";
import { useChatEventSource } from "./use-chat-event-source";

export type ChatStreamListener = {
  onMessage?: (message: ChatMessage, arrival: MessageArrival) => void;
  onResume?: () => void;
};

export type ChatStreamValue = {
  participants: Participant[];
  unreadCount: number;
  subscribe: (listener: ChatStreamListener) => () => void;
  /** Declared by whichever screen is showing the conversation — it suppresses the badge and drives the read cursor. */
  setIsReading: (isReading: boolean) => void;
};

export type ChatStreamProviderProps = PropsWithChildren<{
  currentUserId: string;
  initialParticipants: Participant[];
  initialUnreadCount: number;
}>;

const ChatStreamContext = createContext<Nullable<ChatStreamValue>>(null);

// INFO: One retry is enough to close the resume race below; a second would only chase a message the next resume corrects anyway.
const UNREAD_SYNC_PASSES = 2;

/**
 * Holds the app's one `EventSource` (REQUIREMENTS.md § 8.4.).
 *
 * WARN: It lives in the shell, not in the chat screen. Scoped to the screen the
 * stream would drop on every tab switch, and the other three tabs would never
 * move the badge — a message would surface only once the user happened to walk
 * back into the conversation. The § 8.4. background close is untouched
 * and is still what lets Neon's compute autosuspend: the stream ends when the app
 * goes away, not when the user opens the calendar.
 */
export function ChatStreamProvider({
  currentUserId,
  initialParticipants,
  initialUnreadCount,
  children,
}: ChatStreamProviderProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const listeners = useRef(new Set<ChatStreamListener>());
  const isReadingRef = useRef(false);
  const lastReadPostAt = useRef(0);
  const hasMessageDuringSync = useRef(false);
  // INFO: REQUIREMENTS.md § 15.1. Lives beside the stream because that is what carries the signal, not because refreshing is a chat concern.
  const handleBuild = useAppRefresh();

  // WARN: The one value in here that has to be referentially stable — `useChatStreamListener` keys its subscription effect on it.
  const subscribe = useCallback((listener: ChatStreamListener) => {
    listeners.current.add(listener);

    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const setIsReading = useCallback((isReading: boolean) => {
    isReadingRef.current = isReading;

    if (isReading) {
      setUnreadCount(0);
    }

    // INFO: REQUIREMENTS.md § 8.8. Both edges are forced — entering the conversation is a read event too, and a throttled entry parks the cursor behind a message that is already on screen.
    void markRead(true);
  }, []);

  useChatEventSource({
    onMessage: handleMessage,
    onUserChanged: refreshParticipants,
    onResume: handleResume,
    onBuild: handleBuild,
  });

  useEffect(() => {
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  // INFO: REQUIREMENTS.md § 8.8. Backgrounding is not an unmount, so without this the exit flush never runs on the one path that matters most — the app going away with the last message read.
  useEffect(() => {
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushReadCursor);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushReadCursor);
    };

    function flushWhenHidden() {
      if (document.visibilityState === "hidden") {
        flushReadCursor();
      }
    }

    function flushReadCursor() {
      if (isReadingRef.current) {
        void markRead(true);
      }
    }
  }, []);

  return (
    <ChatStreamContext.Provider value={{ participants, unreadCount, subscribe, setIsReading }}>
      {children}
    </ChatStreamContext.Provider>
  );

  function handleMessage(message: ChatMessage, arrival: MessageArrival) {
    listeners.current.forEach((listener) => listener.onMessage?.(message, arrival));

    // INFO: REQUIREMENTS.md § 8.5. The stream echoes my own message back to me; alerting myself to it is not a notification.
    if (message.senderId === currentUserId) {
      return;
    }

    // INFO: Set on every delivery; `syncUnreadCount` clears it before each pass and only reads it while one is in flight.
    hasMessageDuringSync.current = true;

    if (isReadingRef.current) {
      void markRead();

      return;
    }

    setUnreadCount((previous) => previous + 1);
  }

  function handleResume() {
    listeners.current.forEach((listener) => listener.onResume?.());

    if (isReadingRef.current) {
      setUnreadCount(0);
      // WARN: The badge is written here rather than left to the effect above — the count is already `0`, so React bails out and the effect never runs to clear a badge `sw.js` raised while the page was frozen.
      updateAppBadge(0);
      void markRead(true);

      return;
    }

    void syncUnreadCount();
  }

  async function refreshParticipants() {
    // INFO: A failed refresh keeps the names already on screen; the next event or resume retries, and the payload is idempotent.
    const next = await safelyGetAsync(fetchParticipants);

    if (next) {
      setParticipants(next);
    }
  }

  // WARN: The running total this provider keeps is optimistic and blind to whatever landed while the stream was closed, so a resume replaces it with the server's rather than adding to it.
  async function syncUnreadCount() {
    // WARN: A message committed between the count query and the stream opening is counted by neither, and one delivered just after the socket opens is counted twice, so a delivery during the query buys one more pass — by then it is committed and the server's number is exact.
    for (let pass = 0; pass < UNREAD_SYNC_PASSES; pass += 1) {
      hasMessageDuringSync.current = false;

      const count = await safelyGetAsync(fetchUnreadCount);

      if (count === undefined) {
        return;
      }

      setUnreadCount(count);

      if (!hasMessageDuringSync.current) {
        return;
      }
    }
  }

  /**
   * REQUIREMENTS.md § 8.8. Throttled on the leading edge, because every UPDATE
   * that lands fires `user_changed` at the other device. `force` skips it for the
   * events that bound a reading session — entering, leaving, and backgrounding —
   * since a cursor parked a throttle window behind turns the last message read
   * into a push notification.
   */
  async function markRead(force = false) {
    const now = Date.now();

    if (!force && now - lastReadPostAt.current < READ_CURSOR_THROTTLE) {
      return;
    }

    lastReadPostAt.current = now;

    await safelyRunAsync(postRead);
  }
}

export function useChatStream(): ChatStreamValue {
  const value = useContext(ChatStreamContext);

  if (!value) {
    throw new Error("useChatStream must be used inside ChatStreamProvider");
  }

  return value;
}

/**
 * Subscribes to the shell's stream for as long as the caller is mounted. The
 * handlers are read through a ref, so a screen may hand over fresh closures on
 * every render without churning the subscription.
 */
export function useChatStreamListener(listener: ChatStreamListener) {
  const { subscribe } = useChatStream();
  const current = useRef(listener);

  useEffect(() => {
    current.current = listener;
  });

  useEffect(
    () =>
      subscribe({
        onMessage: (message, arrival) => current.current.onMessage?.(message, arrival),
        onResume: () => current.current.onResume?.(),
      }),
    [subscribe],
  );
}
