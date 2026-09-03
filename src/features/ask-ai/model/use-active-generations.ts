"use client";

import type { ChatMessage } from "@/entities/message";
import { useChatStreamListener } from "@/features/chat-stream/@x/ask-ai";
import { LLM_ECHO_TIMEOUT, type LlmSseEvent } from "@/shared/config";
import type { Optional, UserId } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cancelGeneration as deleteGeneration } from "../api/cancel-generation";

export type GenerationEntry = {
  status: "queued" | "running";
  questionClientMsgId: string;
  userId: UserId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — draws the private-theme bubble fill/ink while streaming. */
  onlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1., § 8.15. 조용히 보내기 — draws the dashed silent bubble while streaming. */
  silent?: boolean;
  provider?: string;
  model?: string;
  text: string;
  stopped?: boolean;
  /** The local half of a 중지 tap — set at the tap, so the row answers before the server's `end` does. */
  cancelling?: boolean;
};

export type ActiveGenerations = {
  /** Keyed by `streamId`, in the order each run was admitted to the queue. */
  generations: Map<string, GenerationEntry>;
  cancelGeneration: (streamId: string) => void;
};

// WARN: `seq` reorders in transit (`shared/config/llm.ts`'s own comment on the field) — a delta that arrives ahead of the one before it is held here rather than applied out of order.
type StreamState = {
  entry: GenerationEntry;
  nextSeq: Optional<number>;
  pendingDeltas: Map<number, string>;
};

/**
 * Every AI generation currently queued or streaming, fed by the `llm` SSE
 * channel (`shared/config/llm.ts`'s `llmSseEventSchema`). An entry is created by
 * `queued`/`start`/`snapshot` and removed only by `error`, or by the ordinary
 * chat message whose `clientMsgId` equals the `streamId` — never by `end` alone,
 * so the bubble does not flicker between the stream ending and that echo landing.
 */
export function useActiveGenerations(messages?: ChatMessage[]): ActiveGenerations {
  const [generations, setGenerations] = useState<Map<string, GenerationEntry>>(new Map());
  const streamsRef = useRef(new Map<string, StreamState>());
  const echoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const commit = useCallback(() => {
    setGenerations(
      new Map(Array.from(streamsRef.current, ([streamId, state]) => [streamId, state.entry])),
    );
  }, []);

  const removeStream = useCallback(
    (streamId: string) => {
      const timer = echoTimers.current.get(streamId);

      if (timer !== undefined) {
        clearTimeout(timer);
        echoTimers.current.delete(streamId);
      }

      if (streamsRef.current.delete(streamId)) {
        commit();
      }
    },
    [commit],
  );

  const armEchoTimer = useCallback(
    (streamId: string) => {
      clearTimeout(echoTimers.current.get(streamId));
      echoTimers.current.set(
        streamId,
        setTimeout(() => removeStream(streamId), LLM_ECHO_TIMEOUT),
      );
    },
    [removeStream],
  );

  const handleLlm = useCallback(
    (event: LlmSseEvent) => {
      switch (event.type) {
        case "queued": {
          streamsRef.current.set(event.streamId, {
            entry: {
              status: "queued",
              questionClientMsgId: event.questionClientMsgId,
              userId: event.userId,
              onlyMe: event.onlyMe,
              silent: event.silent,
              text: "",
            },
            nextSeq: undefined,
            pendingDeltas: new Map(),
          });
          commit();

          return;
        }

        case "start": {
          const existing = streamsRef.current.get(event.streamId);
          const entry: GenerationEntry = {
            ...(existing?.entry ?? {
              status: "queued",
              questionClientMsgId: event.questionClientMsgId,
              userId: event.userId,
            }),
            status: "running",
            onlyMe: event.onlyMe ?? existing?.entry.onlyMe,
            silent: event.silent ?? existing?.entry.silent,
            provider: event.provider,
            model: event.model,
            // WARN: A re-published `start` is the server falling back to another agent mid-run — the failed agent's fragment must not linger under the one that replaces it.
            text: "",
          };

          // WARN: The event's own `seq`, never a flat `0` — a re-published `start` is an attempt that carries on from the run's counter, and a buffer reset to 0 holds every delta of it forever.
          streamsRef.current.set(event.streamId, {
            entry,
            nextSeq: event.seq ?? 0,
            pendingDeltas: new Map(),
          });
          commit();

          return;
        }

        case "delta": {
          const state = streamsRef.current.get(event.streamId);

          // INFO: A delta with no `queued`/`start`/`snapshot` behind it belongs to a run this connection missed the beginning of entirely — the next resume's snapshot backfills it, not this delta.
          if (!state) {
            return;
          }

          applyDelta(state, event.seq, event.text);
          commit();

          return;
        }

        case "end": {
          const state = streamsRef.current.get(event.streamId);

          if (!state) {
            return;
          }

          state.entry = { ...state.entry, stopped: event.stopped };
          commit();
          // INFO: The row stays up until the `assistant_reply` echo lands and dedups it by `clientMsgId`; this is the fallback if that echo never arrives.
          armEchoTimer(event.streamId);

          return;
        }

        case "error": {
          removeStream(event.streamId);
          toast("AI 응답에 실패했어요");

          return;
        }

        case "snapshot": {
          streamsRef.current.set(event.streamId, {
            entry: {
              status: event.status,
              questionClientMsgId: event.questionClientMsgId,
              userId: event.userId,
              onlyMe: event.onlyMe,
              silent: event.silent,
              provider: event.provider,
              model: event.model,
              text: event.text,
            },
            // WARN: The server's own next-expected seq, not `undefined` — a client that joins mid-stream otherwise buffers every real delta behind a `nextSeq` of `0` that the run has long since passed, and renders nothing until it ends.
            nextSeq: event.seq,
            pendingDeltas: new Map(),
          });
          commit();

          return;
        }
      }
    },
    [commit, armEchoTimer, removeStream],
  );

  useChatStreamListener({
    onLlm: handleLlm,
    // INFO: The echo that retires the streaming row — the finished answer arrives as an ordinary `system` message whose `clientMsgId` is the `streamId` it was streamed under.
    onMessage: (message) => {
      if (streamsRef.current.has(message.clientMsgId)) {
        removeStream(message.clientMsgId);
        return;
      }

      if (message.systemAction === "assistant_reply" && message.replyTo) {
        for (const [streamId, state] of streamsRef.current) {
          if (
            messages?.some(
              (qm) =>
                qm.clientMsgId === state.entry.questionClientMsgId && qm.id === message.replyTo?.id,
            )
          ) {
            removeStream(streamId);
          }
        }
      }
    },
  });

  useEffect(() => {
    if (!messages || messages.length === 0) {
      return;
    }

    for (const [streamId, state] of streamsRef.current) {
      const isAnswered = messages.some(
        (m) =>
          m.clientMsgId === streamId ||
          (m.systemAction === "assistant_reply" &&
            m.replyTo !== null &&
            messages.some(
              (qm) => qm.clientMsgId === state.entry.questionClientMsgId && qm.id === m.replyTo?.id,
            )),
      );

      if (isAnswered) {
        removeStream(streamId);
      }
    }
  }, [messages, removeStream]);

  useEffect(
    () => () => {
      echoTimers.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  // WARN: The flag is what the tap reacts to. `DELETE` only marks the run cancelled — the visible `end` waits on the provider yielding its next chunk, which is seconds of a 중지 that looks like it did nothing.
  const cancelGeneration = useCallback(
    (streamId: string) => {
      const state = streamsRef.current.get(streamId);

      if (!state || state.entry.cancelling) {
        return;
      }

      state.entry = { ...state.entry, cancelling: true };
      commit();

      void requestCancel();

      async function requestCancel() {
        try {
          await deleteGeneration(streamId);
        } catch {
          const pending = streamsRef.current.get(streamId);

          if (pending) {
            pending.entry = { ...pending.entry, cancelling: false };
            commit();
          }

          toast("AI 응답을 중지하지 못했어요");
        }
      }
    },
    [commit],
  );

  return useMemo(() => ({ generations, cancelGeneration }), [generations, cancelGeneration]);
}

function applyDelta(state: StreamState, seq: number, text: string): void {
  // WARN: Only a `seq` of `0` may establish the baseline while it is still unknown — a `queued` never sets one, and adopting whatever seq happens to arrive first would misread a delta that outran `0` in transit as the start, silently dropping the real `0` once it lands as "already passed".
  if (state.nextSeq === undefined) {
    if (seq !== 0) {
      state.pendingDeltas.set(seq, text);

      return;
    }

    state.nextSeq = 0;
  }

  if (seq < state.nextSeq) {
    return;
  }

  if (seq > state.nextSeq) {
    state.pendingDeltas.set(seq, text);

    return;
  }

  state.entry = { ...state.entry, text: state.entry.text + text };
  state.nextSeq += 1;

  for (
    let buffered = state.pendingDeltas.get(state.nextSeq);
    buffered !== undefined;
    buffered = state.pendingDeltas.get(state.nextSeq)
  ) {
    state.pendingDeltas.delete(state.nextSeq);
    state.entry = { ...state.entry, text: state.entry.text + buffered };
    state.nextSeq += 1;
  }
}
