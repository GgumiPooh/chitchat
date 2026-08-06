"use client";

import type { ChatMessage } from "@/entities/message";
import { MESSAGE_PAGE_SIZE } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";
import { fetchMessages } from "../api/fetch-messages";

/**
 * What a jump asked for: it landed, the message is not reachable, or a later
 * jump replaced the window while this one was in flight (REQUIREMENTS.md § 8.6.1.).
 */
export type LoadAroundResult = "ok" | "missing" | "superseded";

/**
 * The loaded window of the conversation. Older pages are keyset-paginated on the
 * message id (REQUIREMENTS.md § 8.2.); the newest page arrives from the server
 * render, so opening the tab costs no client round trip.
 */
export function useMessageHistory(initialMessages: ChatMessage[]) {
  const [messages, setMessages] = useState(initialMessages);
  // INFO: True from the fetch starting until the page is actually in the list, which is what keeps the § 8.3. loading header up across the wait for a still scroller.
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  // INFO: REQUIREMENTS.md § 8.3. A fetched page that has not been committed yet. The rows themselves and not just a flag, so the room can warm their § 8.9. link previews during the hold — the wait for a still scroller is exactly the head start those need to be in the rows' first measurement.
  // WARN: Duplicated into the ref beside it on purpose. The state is what effects wake on; the ref is what `loadOlder`'s guard and `commitPendingOlder` read, and neither may see a render-old value.
  const [pendingOlder, setPendingOlder] = useState<ChatMessage[]>([]);
  const pendingOlderRef = useRef<ChatMessage[]>([]);
  // INFO: REQUIREMENTS.md § 8.6.1. True while the window sits around a jump target rather than at the newest message — everything that answers "is this room live" reads it.
  const [hasNewer, setHasNewer] = useState(false);
  const messagesRef = useRef(initialMessages);
  const isLoadingRef = useRef(false);
  // INFO: A short first page cannot have more behind it, so the upward fetch is never even attempted.
  const hasOlderRef = useRef(initialMessages.length >= MESSAGE_PAGE_SIZE);
  const hasNewerRef = useRef(false);
  // INFO: REQUIREMENTS.md § 8.2. The gap-recovery cursor. Tracked apart from the loaded window because it only ever moves forward — a delete must not walk it back and have § 8.4.'s catch-up refetch what was already seen.
  // WARN: § 8.6.1.'s jump moves the *window* into the past and leaves this alone. They are two different questions: what is on screen, and what this client has already been told about.
  const newestKnownIdRef = useRef(initialMessages.at(-1)?.id ?? 0);
  // WARN: § 8.6.1. Bumped by everything that replaces the window whole. `discardPendingOlder` drops a page already *held*, but a fetch still in flight was started against the window that is now gone, and letting it land is what leaves `hasNewerRef` true while `hasNewer` reads false — live arrivals dropped from then on, and the pill that would fix it hidden.
  const windowId = useRef(0);

  const commit = useCallback((update: (previous: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  // WARN: The lock is released only by the load that still owns the window. A superseded pager clearing it would hand it back while the replacement is still fetching.
  const endLoad = useCallback((generation: number) => {
    if (generation === windowId.current) {
      isLoadingRef.current = false;
    }
  }, []);

  /**
   * WARN: REQUIREMENTS.md § 8.3. Fetches but does not insert. A page committed while the
   * scroller is still moving needs a scroll correction WebKit will not take mid-gesture,
   * so the rows wait here for `commitPendingOlder`.
   */
  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];

    // WARN: The held page counts as loading too — its rows are not in `messagesRef` yet, so a second call would ask the server for the very same page.
    if (
      isLoadingRef.current ||
      pendingOlderRef.current.length > 0 ||
      !hasOlderRef.current ||
      !oldest
    ) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingOlder(true);

    const generation = windowId.current;

    try {
      const older = await fetchMessages({ before: oldest.id });

      // WARN: The page is dropped whole, `hasOlder` included — it describes history behind a window that is no longer on screen, and the replacement already cleared the header through `discardPendingOlder`.
      if (generation !== windowId.current) {
        return;
      }

      hasOlderRef.current = older.length >= MESSAGE_PAGE_SIZE;

      if (older.length > 0) {
        pendingOlderRef.current = older;
        setPendingOlder(older);

        return;
      }
    } catch {
      if (generation === windowId.current) {
        toast.error("이전 메시지를 불러오지 못했어요");
      }
    } finally {
      endLoad(generation);
    }

    // INFO: Only the paths that hold nothing land here — a page that is waiting keeps the header up until it is committed.
    setIsLoadingOlder(false);
  }, [endLoad]);

  /** REQUIREMENTS.md § 8.3. Inserts the held page. The caller owns the timing, and the timing is the fix. */
  const commitPendingOlder = useCallback(() => {
    const older = pendingOlderRef.current;

    if (older.length === 0) {
      return;
    }

    pendingOlderRef.current = [];
    setPendingOlder([]);
    commit((previous) => [...older, ...previous]);
    setIsLoadingOlder(false);
  }, [commit]);

  // WARN: § 8.6.1. Both window replacements drop it. Splicing a page of the live edge's history into a window parked around a jump target would draw it under messages it does not follow.
  const discardPendingOlder = useCallback(() => {
    pendingOlderRef.current = [];
    setPendingOlder([]);
    setIsLoadingOlder(false);
  }, []);

  // INFO: Seizes the lock rather than waiting for it — both callers replace the window whole, so whatever a pager is fetching is about to be irrelevant, and the generation is what stops it landing anyway.
  const beginReplacement = useCallback(() => {
    windowId.current += 1;
    isLoadingRef.current = true;
    discardPendingOlder();

    return windowId.current;
  }, [discardPendingOlder]);

  // INFO: REQUIREMENTS.md § 8.4. Deduplicated by id — the SSE replay margin and the resume catch-up overlap by design, so a batch that is entirely duplicates is the normal case.
  const receiveMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (incoming.length === 0) {
        return;
      }

      newestKnownIdRef.current = incoming.reduce(
        (newest, message) => Math.max(newest, message.id),
        newestKnownIdRef.current,
      );

      // WARN: REQUIREMENTS.md § 8.6.1. A window parked around a jump target has a gap between it and the newest message, so appending an arrival there would draw it directly under history it does not follow. The cursor above still moves, which is what keeps `returnToLive` from refetching this ground.
      if (hasNewerRef.current) {
        return;
      }

      commit((previous) => {
        const known = new Set(previous.map((entry) => entry.id));
        const added = incoming.filter((message) => !known.has(message.id));

        // WARN: Sorted rather than appended. Ids commit out of order (§ 8.4.), so a live event can arrive behind one the replay already delivered.
        return added.length === 0 ? previous : [...previous, ...added].sort((a, b) => a.id - b.id);
      });
    },
    [commit],
  );

  /** Whether the message was one the loaded window did not already hold — the § 8.4. replay redelivers what is already on screen. */
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      const isKnown = messagesRef.current.some((entry) => entry.id === message.id);

      receiveMessages([message]);

      return !isKnown;
    },
    [receiveMessages],
  );

  /**
   * WARN: REQUIREMENTS.md § 8.10. Also retires the quotes pointing at it. The quote is
   * resolved from the parent row (§ 8.10.), so every other client's next fetch already
   * reads 삭제된 메시지예요 — only the deleter's own loaded window would go on showing
   * the text it just removed, until a reload.
   */
  const removeMessage = useCallback(
    (id: number) =>
      commit((previous) =>
        previous.filter((entry) => entry.id !== id).map((entry) => withDeletedQuote(entry, id)),
      ),
    [commit],
  );

  /**
   * REQUIREMENTS.md § 8.6.1. Replaces the window with context on both sides of one
   * message — the jump a quote (§ 8.10.) or a search result asks for.
   *
   * WARN: Three answers, not two. `superseded` is a later jump having taken the
   * window while this fetch was out, which is an ordinary outcome of pressing
   * § 8.6.1.'s arrows twice in a row — reported as `missing` it puts
   * 원본 메시지를 찾지 못했어요 on screen for a jump the user watched succeed.
   *
   * WARN: It preempts a pager in flight rather than declining. Declining returned the
   * same `false` as a genuinely unreachable message, so tapping a quote while the
   * scroller happened to be fetching answered 원본 메시지를 찾지 못했어요 for a parent
   * that was one page away.
   */
  const loadAround = useCallback(
    async (id: number): Promise<LoadAroundResult> => {
      const generation = beginReplacement();

      try {
        const around = await fetchMessages({ around: id });

        if (generation !== windowId.current) {
          return "superseded";
        }

        if (!around.some((message) => message.id === id)) {
          return "missing";
        }

        // WARN: Both flags are set optimistically rather than derived from the page. `around` splits its limit over two directions, so neither half's length says whether more exists — an unnecessary fetch in each direction is the cost, and it corrects itself on the first short page.
        hasOlderRef.current = true;
        hasNewerRef.current = true;
        setHasNewer(true);
        commit(() => around);

        return "ok";
      } catch {
        if (generation === windowId.current) {
          toast.error("메시지를 불러오지 못했어요");

          return "missing";
        }

        return "superseded";
      } finally {
        endLoad(generation);
      }
    },
    [beginReplacement, commit, endLoad],
  );

  /** REQUIREMENTS.md § 8.6.1. The downward half of paging, which only a jumped-away window ever needs. */
  const loadNewer = useCallback(async () => {
    const newest = messagesRef.current.at(-1);

    if (isLoadingRef.current || !hasNewerRef.current || !newest) {
      return;
    }

    isLoadingRef.current = true;

    const generation = windowId.current;

    try {
      const newer = await fetchMessages({ after: newest.id });

      // WARN: The verdict is dropped along with the page. Writing `hasNewerRef` here after a `returnToLive` has restored the live window is what strands the room: the ref says "not live" while `hasNewer` says it is, so `receiveMessages` refuses every arrival and no pill offers a way back.
      if (generation !== windowId.current) {
        return;
      }

      const isAtLiveEdge = newer.length < MESSAGE_PAGE_SIZE;

      hasNewerRef.current = !isAtLiveEdge;

      if (isAtLiveEdge) {
        setHasNewer(false);
      }

      if (newer.length > 0) {
        // WARN: Committed directly rather than through `receiveMessages`, which refuses to insert while the window is not live — this loop is what makes it live again.
        commit((previous) => {
          const known = new Set(previous.map((entry) => entry.id));

          return [...previous, ...newer.filter((message) => !known.has(message.id))];
        });
      }
    } catch {
      if (generation === windowId.current) {
        toast.error("다음 메시지를 불러오지 못했어요");
      }
    } finally {
      endLoad(generation);
    }
  }, [commit, endLoad]);

  /**
   * REQUIREMENTS.md § 8.6.1. Back to the newest messages from a jump, which the
   * § 6.7. pill and any new send both ask for.
   *
   * INFO: Refetches the newest page rather than paging down to it — the gap can be
   * years wide, and nothing between here and there was going to be read on the way.
   */
  const returnToLive = useCallback(async () => {
    if (!hasNewerRef.current) {
      return;
    }

    // WARN: The generation is bumped before the flags, so a pager already in flight can no longer write either of them back.
    const generation = beginReplacement();

    // WARN: Flipped before the fetch, not after. An arrival landing mid-flight belongs in the window this is restoring, and `receiveMessages` is what decides that.
    hasNewerRef.current = false;
    setHasNewer(false);

    try {
      const page = await fetchMessages({});
      const newestId = page.at(-1)?.id ?? 0;

      if (page.length === 0 || generation !== windowId.current) {
        return;
      }

      hasOlderRef.current = page.length >= MESSAGE_PAGE_SIZE;
      newestKnownIdRef.current = Math.max(newestKnownIdRef.current, newestId);
      // INFO: Anything that arrived while the page was in flight is newer than it, so it is carried over rather than replaced away.
      commit((previous) => [...page, ...previous.filter((entry) => entry.id > newestId)]);
    } catch {
      if (generation === windowId.current) {
        toast.error("최근 메시지를 불러오지 못했어요");
      }
    } finally {
      endLoad(generation);
    }
  }, [beginReplacement, commit, endLoad]);

  /**
   * REQUIREMENTS.md § 8.4. Everything that landed while the stream was closed.
   * This is the normal sync path, not an error path — the stream is closed on
   * purpose whenever the tab backgrounds.
   */
  const catchUp = useCallback(
    () =>
      safelyRunAsync(async () => {
        // WARN: A local cursor, advanced only by what this loop fetched. Reading the ref each round would let a live event landing mid-loop carry it past a page the fetch has not covered yet, leaving a hole nothing asks for again.
        let after = newestKnownIdRef.current;

        for (;;) {
          const missed = await fetchMessages({ after });
          const newest = missed.at(-1);

          receiveMessages(missed);

          if (!newest || missed.length < MESSAGE_PAGE_SIZE) {
            return;
          }

          after = newest.id;
        }
      }),
    [receiveMessages],
  );

  return {
    messages,
    isLoadingOlder,
    pendingOlder,
    hasNewer,
    loadOlder,
    commitPendingOlder,
    loadNewer,
    loadAround,
    returnToLive,
    appendMessage,
    removeMessage,
    catchUp,
  };
}

function withDeletedQuote(message: ChatMessage, deletedId: number): ChatMessage {
  const { replyTo } = message;

  if (!replyTo || replyTo.id !== deletedId) {
    return message;
  }

  return {
    ...message,
    replyTo: { ...replyTo, text: null, thumbnailMediaId: null, isDeleted: true },
  };
}
