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
import { fetchChatContext } from "../api/fetch-chat-context";
import { fetchUnreadCount } from "../api/fetch-unread-count";
import { postRead } from "../api/post-read";
import { DormantOverlay } from "../ui/dormant-overlay";
import { useAppRefresh } from "./use-app-refresh";
import { type ChatEventSourceHandlers } from "./use-chat-event-source";
import { useDormancy } from "./use-dormancy";

export type ChatStreamListener = {
  onMessage?: (message: ChatMessage, arrival: MessageArrival) => void;
  onResume?: () => void;
  /** REQUIREMENTS.md § 8.13. A row already on screen, changed — corrected, or withdrawn and now a tombstone. */
  onChange?: (message: ChatMessage) => void;
};

export type ChatStreamValue = {
  participants: Participant[];
  /**
   * REQUIREMENTS.md § 12.2. The wallpaper behind the conversation, shared by both
   * participants.
   *
   * WARN: Held here rather than passed down from the chat screen's server render,
   * because either participant can change it and the other one must see it without
   * navigating. It rides the same `user_changed` refetch the participant set does, so
   * the resume catch-up covers the change that landed while the tab was backgrounded
   * (§ 8.4.) for free.
   */
  chatBackgroundMediaId: Nullable<string>;
  unreadCount: number;
  /** Everyone but me who is composing right now. REQUIREMENTS.md § 8.12. */
  typingUserIds: string[];
  /** REQUIREMENTS.md § 8.4.1. The app is asleep and every request to our API is refused. */
  isDormant: boolean;
  subscribe: (listener: ChatStreamListener) => () => void;
  /** Declared by whichever screen is showing the conversation — it suppresses the badge and drives the read cursor. */
  setIsReading: (isReading: boolean) => void;
  /**
   * REQUIREMENTS.md § 8.1., § 8.8. Moves the cursor now, past the throttle.
   *
   * INFO: For the deliberate arrival at the newest message — the § 6.7. pill. The
   * throttled write covers a reader who is simply sitting in the room, but that tap
   * is the one moment the reader states they have caught up, and leaving it a
   * throttle window behind turns the message they are looking at into a push.
   */
  markRead: () => void;
};

export type ChatStreamProviderProps = PropsWithChildren<{
  currentUserId: string;
  initialParticipants: Participant[];
  /** REQUIREMENTS.md § 12.2. Seeded by the shell's render, so the room paints its wallpaper before any request is made. */
  initialChatBackgroundMediaId: Nullable<string>;
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
  initialChatBackgroundMediaId,
  initialUnreadCount,
  children,
}: ChatStreamProviderProps) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [chatBackgroundMediaId, setChatBackgroundMediaId] = useState(initialChatBackgroundMediaId);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  // INFO: REQUIREMENTS.md § 8.12. When each signal stops counting, by this device's clock. Nothing seeds it — 입력 중 is never replayed, so a fresh mount knows nothing until a live event arrives.
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const typingExpiry = useRef(new Map<string, number>());
  const typingSweep = useRef<Optional<ReturnType<typeof setTimeout>>>(undefined);
  const listeners = useRef(new Set<ChatStreamListener>());
  const isReadingRef = useRef(false);
  const lastReadPostAt = useRef(0);
  const hasMessageDuringSync = useRef(false);
  // WARN: REQUIREMENTS.md § 8.4.1. First, and deliberately. Effects run in declaration order, so this is what registers the departure listener that shuts the request gate ahead of the read-cursor flush below.
  const { isDormant, wake } = useDormancy();
  // INFO: § 8.4.1. The listeners below are registered once and read this from a closure, so the state needs a ref beside it.
  const isDormantRef = useRef(isDormant);
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

  // WARN: Forced, like the edges above. A tap that lands inside the throttle window would otherwise report nothing, which is exactly the case this exists for — the reader has just travelled to a message that arrived seconds ago.
  const markReadNow = useCallback(() => void markRead(true), []);

  // WARN: Lazy initial state rather than a ref — the identity has to be stable *and* readable during render, and a ref read here is what React Compiler rejects. A fresh object would re-render the connection on every message that lands.
  const [handlers] = useState<ChatEventSourceHandlers>(() => ({
    onMessage: (message, arrival) => handleMessage(message, arrival),
    onUserChanged: () => void refreshChatContext(),
    onResume: () => handleResume(),
    onTyping: (userId, isTyping) => handleTyping(userId, isTyping),
    onChange: (message) => handleChange(message),
    onBuild: (id) => handleBuild(id),
  }));

  // INFO: The provider outlives every screen, so this only ever runs on a full teardown — but a timer left armed past it would call `setTypingUserIds` on an unmounted tree.
  useEffect(() => () => clearTimeout(typingSweep.current), []);

  /**
   * REQUIREMENTS.md § 8.4.1. The catch-up for a wake on a screen that holds no
   * socket — 캘린더, 보관함, 설정 never mount `ChatStreamConnection`, so nothing else
   * would correct a badge that went stale while the gate was shut.
   *
   * WARN: Gated on `isReadingRef` because that is what "the conversation is on
   * screen" means here, and there the reopened stream's own `onopen` already syncs
   * — running both would spend two `GET /api/chat/unread` on one tap.
   */
  useEffect(() => {
    // WARN: The transition, never the value. This effect also runs on mount, where `isDormant` is already `false` and the count is the one the shell was server-rendered with — syncing there would be a request per launch that the § 8.4.2. seeding exists to avoid.
    const wasDormant = isDormantRef.current;

    isDormantRef.current = isDormant;

    if (wasDormant && !isDormant && !isReadingRef.current) {
      void syncUnreadCount();
    }
  }, [isDormant]);

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

      // WARN: § 8.4.1. Dormant beats reading. The gate exists because a reader's cursor is about to clear the count anyway — but under the 절전 모드 overlay the conversation is covered and the stream that would have delivered the message is closed, so the reader is not reading and the count is real.
      if (message.success && (!isReadingRef.current || isDormantRef.current)) {
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
      // INFO: § 8.4.1. Dormant beats reading here for the same reason it does in the worker message above — the overlay is up and no stream is delivering anything.
      if (!isReadingRef.current || isDormantRef.current) {
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
      value={{
        participants,
        chatBackgroundMediaId,
        unreadCount,
        typingUserIds,
        isDormant,
        subscribe,
        setIsReading,
        markRead: markReadNow,
      }}
    >
      <ChatStreamHandlersContext.Provider value={handlers}>
        {children}
        {/* INFO: REQUIREMENTS.md § 8.4.1. Rendered by the shell rather than the chat screen, because the request gate it stands for is shut on every tab and a screen that could not explain why nothing loads is worse than one that never sleeps. */}
        {isDormant && <DormantOverlay onWake={wake} />}
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

  /**
   * REQUIREMENTS.md § 8.13. A row already delivered, changed. It moves no count and
   * raises no notification of its own — the reader has been told about this message
   * once already.
   *
   * WARN: A **deletion** is the one exception, and the badge is resynced rather
   * than decremented. `countUnreadMessages` excludes deleted rows, so a delete of
   * something this client counted leaves the number one high — and nothing here can
   * tell whether the withdrawn row was one of the unread ones, which is exactly what
   * `syncUnreadCount` replaces wholesale.
   */
  function handleChange(message: ChatMessage) {
    listeners.current.forEach((listener) => listener.onChange?.(message));

    // INFO: A reader's cursor is about to clear the count anyway, and § 8.8.'s write is what moves it.
    if (message.isDeleted && !isReadingRef.current) {
      void syncUnreadCount();
    }
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

  async function refreshChatContext() {
    // INFO: A failed refresh keeps the names already on screen; the next event or resume retries, and the payload is idempotent.
    const next = await safelyGetAsync(fetchChatContext);

    if (next) {
      setParticipants(next.participants);
      // INFO: REQUIREMENTS.md § 12.2. Set unconditionally, `null` included — this is how 기본 배경으로 reaches the other participant.
      setChatBackgroundMediaId(next.chatBackgroundMediaId);
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

  // WARN: Every field of `ChatStreamListener` has to be forwarded by hand here. Spreading the ref would capture the mount-time closures, which is what the ref exists to avoid — so a handler added to the type and not to this object type-checks and silently never fires.
  useEffect(
    () =>
      subscribe({
        onMessage: (message, arrival) => current.current.onMessage?.(message, arrival),
        onResume: () => current.current.onResume?.(),
        onChange: (message) => current.current.onChange?.(message),
      }),
    [subscribe],
  );
}
