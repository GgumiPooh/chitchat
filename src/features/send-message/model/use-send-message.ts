"use client";

import type { ChatMessage } from "@/entities/message";
import { useCallback, useRef, useState } from "react";
import { postMessage } from "../api/post-message";

/** An outgoing message the server has not echoed back yet (REQUIREMENTS.md § 8.5.). */
export type PendingMessage = {
  clientMsgId: string;
  text: string;
  status: "sending" | "failed";
  createdAt: string;
};

export type UseSendMessageParams = {
  onSent: (message: ChatMessage) => void;
};

/**
 * Optimistic sending. The bubble is rendered from `pending` the moment the user
 * hits send and is handed over to `onSent` once the row exists; a failure keeps
 * it in the list so § 8.5.'s retry affordance has something to retry.
 */
export function useSendMessage({ onSent }: UseSendMessageParams) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const pendingRef = useRef<PendingMessage[]>([]);

  const commit = useCallback((update: (previous: PendingMessage[]) => PendingMessage[]) => {
    pendingRef.current = update(pendingRef.current);
    setPending(pendingRef.current);
  }, []);

  /**
   * Retires the optimistic bubble whose row now exists. REQUIREMENTS.md § 8.5.
   * matches on `client_msg_id` because the SSE echo of my own message routinely
   * beats the response to the POST that created it.
   */
  const resolve = useCallback(
    (clientMsgId: string) =>
      commit((previous) => previous.filter((entry) => entry.clientMsgId !== clientMsgId)),
    [commit],
  );

  const deliver = useCallback(
    async ({ clientMsgId, text }: PendingMessage) => {
      try {
        const sent = await postMessage({ clientMsgId, text });

        onSent(sent);
        resolve(clientMsgId);
      } catch {
        commit((previous) =>
          previous.map((entry) =>
            entry.clientMsgId === clientMsgId ? { ...entry, status: "failed" } : entry,
          ),
        );
      }
    },
    [commit, onSent, resolve],
  );

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      const message: PendingMessage = {
        // INFO: REQUIREMENTS.md § 8.5. Client-generated, so the retry below collides with the first attempt instead of duplicating it.
        clientMsgId: crypto.randomUUID(),
        text: trimmed,
        status: "sending",
        createdAt: new Date().toISOString(),
      };

      commit((previous) => [...previous, message]);
      void deliver(message);
    },
    [commit, deliver],
  );

  const retry = useCallback(
    (clientMsgId: string) => {
      const target = pendingRef.current.find((entry) => entry.clientMsgId === clientMsgId);

      if (!target || target.status === "sending") {
        return;
      }

      commit((previous) =>
        previous.map((entry) =>
          entry.clientMsgId === clientMsgId ? { ...entry, status: "sending" } : entry,
        ),
      );
      void deliver(target);
    },
    [commit, deliver],
  );

  return { pending, send, retry, resolve };
}
