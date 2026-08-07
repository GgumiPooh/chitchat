"use client";

import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import { updateAppBadge } from "@/shared/badge";
import {
  READ_CURSOR_THROTTLE,
  TYPING_TIMEOUT,
  unreadCountMessageSchema,
  type MessageArrival,
} from "@/shared/config";
import { safelyGetAsync, safelyRunAsync, type Nullable, type Optional } from "@/shared/lib";
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
import { type ChatEventSourceHandlers } from "./use-chat-event-source";

export type ChatStreamListener = {
  onMessage?: (message: ChatMessage, arrival: MessageArrival) => void;
  onResume?: () => void;
};

export type ChatStreamValue = {
  participants: Participant[];
  unreadCount: number;
  /** Everyone but me who is composing right now. REQUIREMENTS.md § 8.12. */
  typingUserIds: string[];
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

/**
 * REQUIREMENTS.md § 8.4. The provider's own handlers, handed to whichever screen
 * is holding the socket open.
 *
 * WARN: A context of its own, not a field on `ChatStreamValue`. It is stable for
 * the life of the provider, so putting it on the value every screen reads would
 * re-render all of them whenever the participant set or the unread count moved.
 */
const ChatStreamHandlersContext = createContext<Nullable<ChatEventSourceHandlers>>(null);

// INFO: One retry is enough to close the resume race below; a second would only chase a message the next resume corrects anyway.
const UNREAD_SYNC_PASSES = 2;

/**
 * Holds the conversation's shared state — the participant set, the unread count,
 * who is typing (REQUIREMENTS.md § 8.4.).
 *
 * WARN: It does **not** hold the socket. The state lives in the shell because
 * `participants` is read from the calendar and the profile screen, and the badge
 * is drawn by the tab bar; the `EventSource` lives in the chat screen, mounted by
 * `ChatStreamConnection` (§ 8.4.2.). Moving this provider down with it would
 * strand every one of those consumers.
 */
export function ChatStreamProvider({
  currentUserId,
  initialParticipants,
  initialUnreadCount,
  children,
}: ChatStreamProviderProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  // INFO: REQUIREMENTS.md § 8.12. When each signal stops counting, by this device's clock. Nothing seeds it — 입력 중 is never replayed, so a fresh mount knows nothing until a live event arrives.
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingExpiry = useRef(new Map<string, number>());
  const typingSweep = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);
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

  // WARN: Lazy initial state rather than a ref — the identity has to be stable *and* readable during render, and a ref read here is what React Compiler rejects. A fresh object would re-render the connection on every message that lands.
  const [handlers] = useState<ChatEventSourceHandlers>(() => ({
    onMessage: (message, arrival) => handleMessage(message, arrival),
    onUserChanged: () => void refreshParticipants(),
    onResume: () => handleResume(),
    onTyping: (userId, isTyping) => handleTyping(userId, isTyping),
    onBuild: (id) => handleBuild(id),
  }));

  // INFO: The provider outlives every screen, so this only ever runs on a full teardown — but a timer left armed past it would call `setTypingUserIds` on an unmounted tree.
  useEffect(() => () => clearTimeout(typingSweep.current), []);

  useEffect(() => {
    updateAppBadge(unreadCount);
  }, [unreadCount]);

  /**
   * REQUIREMENTS.md § 8.4.2. The badge on the three tabs that hold no stream.
   *
   * WARN: The server's own count, so it replaces rather than increments — a client
   * that has been off 채팅 has missed every arrival and has nothing to add to.
   */
  useEffect(() => {
    const worker = navigator.serviceWorker;

    worker?.addEventListener("message", handleWorkerMessage);

    return () => worker?.removeEventListener("message", handleWorkerMessage);

    function handleWorkerMessage(event: MessageEvent<unknown>) {
      const message = unreadCountMessageSchema.safeParse(event.data);

      // INFO: § 8.8. A reader is looking at the conversation, so the count it would raise is one the read cursor is about to clear.
      if (message.success && !isReadingRef.current) {
        setUnreadCount(message.data.unreadCount);
      }
    }
  }, []);

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

        return;
      }

      // WARN: REQUIREMENTS.md § 8.4.2. The badge's only other mover is the § 16.1. push, and that has three states where it never arrives — denied, unsupported, and in flight. Without this a client in one of them shows the count it was rendered with until it next walks into 채팅.
      if (!isReadingRef.current) {
        void syncUnreadCount();
      }
    }

    function flushReadCursor() {
      if (isReadingRef.current) {
        void markRead(true);
      }
    }
  }, []);

  return (
    <ChatStreamContext.Provider
      value={{ participants, unreadCount, typingUserIds, subscribe, setIsReading }}
    >
      <ChatStreamHandlersContext.Provider value={handlers}>
        {children}
      </ChatStreamHandlersContext.Provider>
    </ChatStreamContext.Provider>
  );

  /**
   * REQUIREMENTS.md § 8.12. The signal renews rather than toggles — every arrival
   * pushes this sender's deadline out, and nothing but the deadline takes it back
   * down.
   */
  function handleTyping(userId: string, isTyping: boolean) {
    // INFO: The channel is a conversation-wide broadcast, exactly like `user_changed`, so my own ping and my other device's both come back to me here.
    if (userId === currentUserId) {
      return;
    }

    if (!isTyping) {
      // WARN: § 8.12. The stop only ever brings the deadline *forward*. A stop that raced ahead of a ping still in flight would otherwise be undone by it, and the indicator would sit there for the full timeout after the message had already landed — dropping the entry is what makes that race cost nothing.
      typingExpiry.current.delete(userId);
      sweepTyping();

      return;
    }

    // WARN: Stamped on arrival with this device's clock. The publisher deliberately sends no deadline of its own (§ 8.12.) — two devices a few seconds apart would otherwise hold the indicator up well past the typing that raised it.
    typingExpiry.current.set(userId, Date.now() + TYPING_TIMEOUT);
    sweepTyping();
  }

  /**
   * WARN: Expiry is the only thing that clears 입력 중. There is no stop event to
   * wait for — a sender who backgrounds, loses signal or is killed sends nothing
   * at all, and a design that waited would leave the indicator up forever.
   */
  function sweepTyping() {
    const now = Date.now();
    const expiry = typingExpiry.current;
    let nextExpiresAt = Infinity;

    expiry.forEach((expiresAt, userId) => {
      if (expiresAt <= now) {
        expiry.delete(userId);

        return;
      }

      nextExpiresAt = Math.min(nextExpiresAt, expiresAt);
    });

    // WARN: Read out of the Map here, never inside the updater. An updater runs when React drains the queue, by which time an arrival or a resume sweep may have mutated the Map behind it — so it would commit a set the timer armed below does not match, and StrictMode would run it twice against different contents.
    const next = [...expiry.keys()];

    // INFO: The previous array is kept when the membership is unchanged, so a renewal every `TYPING_PING_INTERVAL` re-renders nothing.
    setTypingUserIds((previous) => (haveSameMembers(previous, next) ? previous : next));

    clearTimeout(typingSweep.current);
    typingSweep.current =
      nextExpiresAt === Infinity ? undefined : setTimeout(sweepTyping, nextExpiresAt - now);
  }

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

    // WARN: REQUIREMENTS.md § 8.12. A frozen page runs no timers, so the sweep above did not fire while the app was away and every deadline it was holding is now long past. Re-evaluated here rather than trusted, for the same reason § 8.4. re-checks the socket instead of assuming it survived.
    sweepTyping();

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

// WARN: Compared as sets, not position by position. `Map` keys come back in insertion order, so a typist whose signal lapses and resumes is re-inserted at the tail — same members, different order, and an index-wise check would call that a change and re-render every consumer for nothing.
function haveSameMembers(previous: string[], next: string[]): boolean {
  const seen = new Set(previous);

  return previous.length === next.length && next.every((id) => seen.has(id));
}

export function useChatStream(): ChatStreamValue {
  const value = useContext(ChatStreamContext);

  if (!value) {
    throw new Error("useChatStream must be used inside ChatStreamProvider");
  }

  return value;
}

/**
 * REQUIREMENTS.md § 8.4.2. The provider's handlers, for the one screen that holds
 * the socket. Nothing else has any business calling this.
 */
export function useChatStreamHandlers(): ChatEventSourceHandlers {
  const handlers = useContext(ChatStreamHandlersContext);

  if (!handlers) {
    throw new Error("useChatStreamHandlers must be used inside ChatStreamProvider");
  }

  return handlers;
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
