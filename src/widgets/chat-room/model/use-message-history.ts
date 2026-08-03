"use client";

import type { ChatMessage } from "@/entities/message";
import { MESSAGE_PAGE_SIZE } from "@/shared/config";
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

  // INFO: REQUIREMENTS.md § 8.4. Deduplicated by id, so the SSE echo and the send response cannot both land.
  const appendMessage = useCallback(
    (message: ChatMessage) => {
      commit((previous) =>
        previous.some((entry) => entry.id === message.id) ? previous : [...previous, message],
      );
    },
    [commit],
  );

  const removeMessage = useCallback(
    (id: number) => commit((previous) => previous.filter((entry) => entry.id !== id)),
    [commit],
  );

  return { messages, isLoadingOlder, loadOlder, appendMessage, removeMessage };
}
