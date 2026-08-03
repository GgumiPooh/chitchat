"use client";

import type { ChatMessage } from "@/entities/message";
import { MESSAGE_PAGE_SIZE } from "@/shared/config";
import { safelyRunAsync } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";
import { fetchMessages } from "../api/fetch-messages";

/**
 * The loaded window of the conversation. Older pages are keyset-paginated on the
 * message id (REQUIREMENTS.md § 8.2.); the newest page arrives from the server
 * render, so opening the tab costs no client round trip.
 */
export function useMessageHistory(initialMessages: ChatMessage[]) {
  const [messages, setMessages] = useState(initialMessages);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const messagesRef = useRef(initialMessages);
  const isLoadingRef = useRef(false);
  // INFO: A short first page cannot have more behind it, so the upward fetch is never even attempted.
  const hasOlderRef = useRef(initialMessages.length >= MESSAGE_PAGE_SIZE);
  // INFO: REQUIREMENTS.md § 8.2. The gap-recovery cursor. Tracked apart from the loaded window because it only ever moves forward — a delete must not walk it back and have § 8.4.'s catch-up refetch what was already seen.
  const newestKnownIdRef = useRef(initialMessages.at(-1)?.id ?? 0);

  const commit = useCallback((update: (previous: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];

    if (isLoadingRef.current || !hasOlderRef.current || !oldest) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoadingOlder(true);

    try {
      const older = await fetchMessages({ before: oldest.id });

      hasOlderRef.current = older.length >= MESSAGE_PAGE_SIZE;

      if (older.length > 0) {
        commit((previous) => [...older, ...previous]);
      }
    } catch {
      toast.error("이전 메시지를 불러오지 못했어요");
    } finally {
      isLoadingRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [commit]);

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

      commit((previous) => {
        const known = new Set(previous.map((entry) => entry.id));
        const added = incoming.filter((message) => !known.has(message.id));

        // WARN: Sorted rather than appended. Ids commit out of order (§ 8.4.), so a live event can arrive behind one the replay already delivered.
        return added.length === 0 ? previous : [...previous, ...added].sort((a, b) => a.id - b.id);
      });
    },
    [commit],
  );

  const appendMessage = useCallback(
    (message: ChatMessage) => receiveMessages([message]),
    [receiveMessages],
  );

  const removeMessage = useCallback(
    (id: number) => commit((previous) => previous.filter((entry) => entry.id !== id)),
    [commit],
  );

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

  return { messages, isLoadingOlder, loadOlder, appendMessage, removeMessage, catchUp };
}
