import "server-only";

import { readLlmSystemPrompt } from "@/entities/llm-system-prompt";
import {
  createAssistantReplyMessage,
  getMessageIdByClientMsgId,
  type ChatMessage,
} from "@/entities/message";
import {
  GEMINI_AUTO_HIGH_THINKING_MIN_QUESTION_BYTES,
  LLM_AGENT_COOLDOWN,
  LLM_MAX_AGENT_COOLDOWN,
  LLM_NOTIFY_MAX_BYTES,
  LLM_NOTIFY_SAFETY_MARGIN,
  LLM_RETRY_DELAY_SAFETY_MARGIN,
  LLM_STREAM_COALESCE_INTERVAL,
  type LlmThinkingLevel,
} from "@/shared/config";
import type { LlmAgent } from "@/shared/db";
import type { MessageId, Nullable, Optional, UserId } from "@/shared/lib";
import type { LlmProvider, StreamAnswerParams } from "../model/provider";
import { getProvider } from "../model/providers/registry";
import { splitByByteBudget } from "../model/split-by-byte-budget";
import { buildPromptContext } from "./build-prompt-context";
import {
  appendGenerationChunk,
  discardGeneration,
  endGeneration,
  failGeneration,
  getGenerationSnapshot,
  markGenerationRunning,
} from "./generation-registry";
import { listCandidateAgents } from "./list-candidate-agents";
import { publishStreamEvent } from "./publish-stream-event";
import { stampAgentCooldown } from "./stamp-agent-cooldown";

export type RunGenerationParams = {
  /** Doubles as `messages.client_msg_id`, so the SSE echo dedups against the client's own streaming bubble. */
  streamId: string;
  /** The `client_msg_id` of the question message the user sent through the normal send path — carried on every published event so a client ties queue/stream state back to that bubble. */
  questionClientMsgId: string;
  askerId: UserId;
  question: string;
  messageIds: MessageId[];
  /** The model the user picked, if any — tried first, ahead of the rest of the fallback chain. */
  pinnedModel: Optional<string>;
  thinking: Optional<LlmThinkingLevel>;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기, snapshotted by the route — rides every published event and the eventual `assistant_reply` row. */
  onlyMe: boolean;
  /** REQUIREMENTS.md § 16.1., § 8.15. 조용히 보내기, snapshotted the same way — rides the same events and row. */
  silent: boolean;
  /** Aborted by `runQueuedGeneration`'s own `LISTEN` on `LLM_CANCEL_CHANNEL` the moment `DELETE /api/chat/ai` cancels this streamId. */
  abortSignal: AbortSignal;
  isCancelled(): boolean;
};

export type RunGenerationResult =
  { status: "answered"; message: ChatMessage } | { status: "cancelled" } | { status: "failed" };

/**
 * Tries each candidate agent in priority order until one answers, the run is
 * cancelled, or all of them fail. Resolves only once the question is settled one
 * way or another — the route awaits this before responding, and Stage 2's SSE
 * stream is how the answer *appears* to be live while this runs.
 */
export async function runGeneration({
  streamId,
  questionClientMsgId,
  askerId,
  question,
  messageIds,
  pinnedModel,
  thinking,
  onlyMe,
  silent,
  abortSignal,
  isCancelled,
}: RunGenerationParams): Promise<RunGenerationResult> {
  const [context, agents, baseSystemPrompt] = await Promise.all([
    buildPromptContext(question, messageIds, questionClientMsgId, askerId, onlyMe),
    listCandidateAgents(pinnedModel),
    // INFO: REQUIREMENTS.md § 8.15. Read once per run, inside the post-lock generation this already is — a question queued behind the FIFO is answered with whatever the prompt is at the moment it actually runs, not the moment it was asked, matching how 조용히 보내기 is read here too.
    readLlmSystemPrompt(),
  ]);

  // INFO: REQUIREMENTS.md § 8.15, § 16.1. 나에게만 보내기 separates implicit prefix caching and persona context per user.
  const systemPrompt = onlyMe
    ? [`[개인 대화 모드: 사용자 ID ${askerId}]`, baseSystemPrompt].filter(Boolean).join("\n\n")
    : (baseSystemPrompt ?? undefined);
  // WARN: One counter for the whole run, not one per agent attempt — a fallback that restarted it at 0 would publish two `delta`s carrying `seq: 0` for one streamId, and the client has nothing but `seq` to reorder a slow `pg_notify` delivery by.
  const seqRef = { current: 0 };

  for (const agent of agents) {
    if (isCancelled()) {
      return finalizeCancelled(streamId, questionClientMsgId, askerId, "", null, onlyMe, silent);
    }

    const provider = getProvider(agent.provider);

    // WARN: A row naming a provider this deployment has no code for — skipped rather than stamped, since nothing about the row itself was at fault.
    if (!provider) {
      continue;
    }

    await startAttempt(streamId, questionClientMsgId, askerId, agent, seqRef, onlyMe, silent);

    try {
      const text = await streamWithThinkingFallback(
        streamId,
        questionClientMsgId,
        askerId,
        provider,
        agent,
        {
          model: agent.model,
          apiKey: agent.apiKey,
          config: agent.config,
          context,
          systemPrompt,
          abortSignal,
          thinking: thinking ?? toAutoThinkingLevel(agent, question),
        },
        isCancelled,
        seqRef,
        onlyMe,
        silent,
      );

      if (isCancelled()) {
        return finalizeCancelled(
          streamId,
          questionClientMsgId,
          askerId,
          text,
          agent,
          onlyMe,
          silent,
        );
      }

      endGeneration(streamId);
      await publishStreamEvent({
        type: "end",
        streamId,
        questionClientMsgId,
        userId: askerId,
        onlyMe,
        silent,
      });

      // WARN: The stream is done and `end` is already published — leaving the loop here, rather than falling into `catch` on an insert failure, is what stops that failure from re-generating a whole second answer with the next agent.
      return await finalizeAnswered(
        streamId,
        questionClientMsgId,
        askerId,
        text,
        agent,
        onlyMe,
        silent,
      );
    } catch (error) {
      if (isCancelled()) {
        const partial = getGenerationSnapshot(streamId)?.text ?? "";

        return finalizeCancelled(
          streamId,
          questionClientMsgId,
          askerId,
          partial,
          agent,
          onlyMe,
          silent,
        );
      }

      if (isRateLimitError(error)) {
        await stampAgentCooldown(agent, toCooldownDuration(provider.toRetryDelay(error)));
      }
    }
  }

  if (isCancelled()) {
    return finalizeCancelled(streamId, questionClientMsgId, askerId, "", null, onlyMe, silent);
  }

  failGeneration(streamId);
  await publishStreamEvent({
    type: "error",
    streamId,
    questionClientMsgId,
    userId: askerId,
    onlyMe,
    silent,
  });
  discardGeneration(streamId);

  return { status: "failed" };
}

/**
 * A cancellation ends the run exactly like a normal completion when there is
 * something to keep — the accumulated text becomes the assistant's reply, same
 * `client_msg_id`, same insert path — and answers `"cancelled"` only when there is
 * truly nothing to show for it.
 */
async function finalizeCancelled(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
  text: string,
  agent: Nullable<LlmAgent>,
  onlyMe: boolean,
  silent: boolean,
): Promise<RunGenerationResult> {
  await publishStreamEvent({
    type: "end",
    streamId,
    questionClientMsgId,
    userId: askerId,
    stopped: true,
    onlyMe,
    silent,
  });

  if (!text || !agent) {
    discardGeneration(streamId);

    return { status: "cancelled" };
  }

  try {
    const message = await createAssistantReplyMessage({
      senderId: askerId,
      clientMsgId: streamId,
      text,
      llmProvider: agent.provider,
      llmModel: agent.model,
      replyToId: await getMessageIdByClientMsgId(questionClientMsgId),
      onlyMe,
      silent,
    });

    return message ? { status: "answered", message } : { status: "cancelled" };
  } catch (error) {
    // WARN: `end`/`stopped` already published above — the run was stopped, not failed, so a lost partial answers `cancelled` rather than publishing a second, contradictory `error` event.
    console.error("[ask-ai] failed to insert a partial assistant_reply after cancellation", error);

    return { status: "cancelled" };
  } finally {
    discardGeneration(streamId);
  }
}

/**
 * Owns the outcome once a stream has finished (successfully or by cancellation)
 * and `end`/`stopped` is already published — an insert failure here can only
 * report failure, never fall back to a fresh agent and a whole second answer.
 */
async function finalizeAnswered(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
  text: string,
  agent: LlmAgent,
  onlyMe: boolean,
  silent: boolean,
): Promise<RunGenerationResult> {
  try {
    const message = await createAssistantReplyMessage({
      senderId: askerId,
      clientMsgId: streamId,
      text,
      llmProvider: agent.provider,
      llmModel: agent.model,
      // INFO: REQUIREMENTS.md § 8.15. Resolved at insert rather than threaded down from `buildPromptContext`'s own lookup — that one runs before the stream, where the question row can still be behind the replication this read is seconds clear of.
      replyToId: await getMessageIdByClientMsgId(questionClientMsgId),
      onlyMe,
      silent,
    });

    if (message) {
      return { status: "answered", message };
    }

    // WARN: `streamId` is a fresh uuid the client mints per question, so a taken `client_msg_id` here means a retry raced its own first attempt rather than a genuine collision — nothing left to fall back to.
    return { status: "failed" };
  } catch (error) {
    console.error("[ask-ai] failed to insert an assistant_reply after a completed stream", error);
    // WARN: Best-effort — a publish that itself fails must not mask the insert error that got us here.
    await publishStreamEvent({
      type: "error",
      streamId,
      questionClientMsgId,
      userId: askerId,
      onlyMe,
      silent,
    }).catch(() => undefined);

    return { status: "failed" };
  } finally {
    discardGeneration(streamId);
  }
}

/**
 * Retries the same agent once, with `thinking` stripped, when it rejects a
 * request carrying one — kept narrow to that one shape of failure, since
 * anything else (a 429, a genuine outage) belongs to the fallback chain
 * already trying the next agent, not to a second attempt at this one.
 */
async function streamWithThinkingFallback(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
  provider: LlmProvider,
  agent: LlmAgent,
  params: StreamAnswerParams,
  isCancelled: () => boolean,
  seqRef: SeqRef,
  onlyMe: boolean,
  silent: boolean,
): Promise<string> {
  try {
    return await streamAndPublish(
      streamId,
      questionClientMsgId,
      askerId,
      provider,
      params,
      isCancelled,
      seqRef,
      onlyMe,
      silent,
    );
  } catch (error) {
    if (params.thinking && isThinkingRejectedError(error)) {
      // WARN: A second attempt is a second `start`, exactly as the agent chain's own is. `streamAndPublish` restarts its `fullText` at `""`, so without this the registry and every live bubble keep the rejected attempt's fragment and append this one under it — while the row actually inserted carries this attempt alone.
      await startAttempt(streamId, questionClientMsgId, askerId, agent, seqRef, onlyMe, silent);

      return await streamAndPublish(
        streamId,
        questionClientMsgId,
        askerId,
        provider,
        { ...params, thinking: undefined },
        isCancelled,
        seqRef,
        onlyMe,
        silent,
      );
    }

    throw error;
  }
}

/**
 * Opens one agent attempt: the registry drops whatever a previous attempt
 * streamed, and every client is told to do the same.
 *
 * WARN: `seq` rides along because the counter is the run's, not the attempt's — a client that reset its reorder buffer to 0 here would hold every delta of this attempt forever, since they carry on from where the last one stopped.
 */
async function startAttempt(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
  agent: LlmAgent,
  seqRef: SeqRef,
  onlyMe: boolean,
  silent: boolean,
): Promise<void> {
  markGenerationRunning(streamId, agent.provider, agent.model);
  await publishStreamEvent({
    type: "start",
    streamId,
    questionClientMsgId,
    userId: askerId,
    provider: agent.provider,
    model: agent.model,
    seq: seqRef.current,
    onlyMe,
    silent,
  });
}

/**
 * Streams one agent's answer, coalescing deltas into `LLM_STREAM_COALESCE_INTERVAL`-
 * spaced `pg_notify` publishes — splitting each publish under the channel's
 * byte cap on its *escaped* JSON size, envelope included, and mirroring each
 * published chunk onto the in-memory registry at the moment it is queued, with
 * the same `seq` — rather than mirroring raw provider tokens as they arrive,
 * which let the registry describe a stream state `pg_notify` had not actually
 * caught up to yet. Stops early, without throwing, the moment `isCancelled`
 * turns true — `abortSignal` is also wired into the provider so it can stop its
 * own request, but this is the fallback that does not depend on the SDK
 * honouring it promptly.
 */
/** A plain mutable box, not a closure variable — `seq` has to survive being handed to a fresh call of `streamAndPublish` for each agent the fallback chain tries. */
type SeqRef = { current: number };

async function streamAndPublish(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
  provider: LlmProvider,
  params: StreamAnswerParams,
  isCancelled: () => boolean,
  seqRef: SeqRef,
  onlyMe: boolean,
  silent: boolean,
): Promise<string> {
  let buffer = "";
  let fullText = "";
  let lastFlushAt = Date.now();
  // WARN: Publishes are queued behind this chain rather than fired in parallel — two deltas racing on the wire would let the second overtake the first, and the client has no way to reorder them beyond `seq`.
  let pendingPublishes: Promise<void> = Promise.resolve();
  // INFO: Measured once against the real ids rather than per chunk — they are fixed-width for the run's whole duration, and `LLM_NOTIFY_SAFETY_MARGIN` covers what a growing `seq` costs in digits.
  const chunkBudget =
    LLM_NOTIFY_MAX_BYTES -
    measureEnvelopeBytes(streamId, questionClientMsgId, askerId) -
    LLM_NOTIFY_SAFETY_MARGIN;

  const flush = () => {
    if (!buffer) {
      return;
    }

    for (const chunk of splitByByteBudget(buffer, chunkBudget, measureEscapedBytes)) {
      const chunkSeq = seqRef.current++;

      appendGenerationChunk(streamId, chunkSeq, chunk);

      // WARN: Each publish carries its own `catch`. A rejected link would skip every `then` queued behind it — the rest of the answer silently never published — and, on the throwing path, surface as an unhandled rejection that takes the process down.
      pendingPublishes = pendingPublishes.then(() =>
        publishStreamEvent({
          type: "delta",
          streamId,
          questionClientMsgId,
          userId: askerId,
          seq: chunkSeq,
          text: chunk,
          onlyMe,
          silent,
        }).catch((error: unknown) => {
          console.error("[ask-ai] failed to publish a delta", error);
        }),
      );
    }

    buffer = "";
    lastFlushAt = Date.now();
  };

  try {
    for await (const delta of provider.streamAnswer(params)) {
      buffer += delta;
      fullText += delta;

      if (isCancelled()) {
        break;
      }

      if (Date.now() - lastFlushAt >= LLM_STREAM_COALESCE_INTERVAL) {
        flush();
      }
    }
  } finally {
    // WARN: Also reached when `provider.streamAnswer` throws mid-stream (an abort, most often) — without this the last unflushed buffer never reaches the registry, and a caller reading it back after the catch below finds less than was actually generated.
    flush();
    // WARN: Drained here and not after the `try`, so the throwing path waits too — its caller publishes `end` immediately, and a delta still in flight would then land on a bubble the client has already retired.
    await pendingPublishes;
  }

  return fullText;
}

/**
 * The bytes a `delta` event's fixed fields cost — `streamId`/`questionClientMsgId`
 * are uuids and `askerId` a snowflake, all fixed-width for the run's duration —
 * so the text budget below is what is actually left for the escaped chunk once
 * this is measured, rather than a flat guess subtracted from every publish.
 */
function measureEnvelopeBytes(
  streamId: string,
  questionClientMsgId: string,
  askerId: UserId,
): number {
  return Buffer.byteLength(
    JSON.stringify({
      type: "delta",
      streamId,
      questionClientMsgId,
      userId: askerId,
      seq: 0,
      text: "",
    }),
  );
}

/** How many bytes `chunk` costs once it is the value of a JSON string field — a quote, backslash or newline doubles to two bytes there, which raw UTF-8 length does not account for. */
function measureEscapedBytes(chunk: string): number {
  return Buffer.byteLength(JSON.stringify(chunk));
}

/**
 * Duck-typed rather than an `instanceof` check against one provider's SDK — the
 * fallback chain is meant to take a second provider without the runner learning a
 * new error class, and `@google/genai`'s own `ApiError` already carries `status`
 * this way.
 */
function isRateLimitError(error: unknown): boolean {
  return isRecord(error) && error.status === 429;
}

/** The provider's own hint (plus a safety margin, clamped) when it has one; `LLM_AGENT_COOLDOWN`'s flat default otherwise. */
function toCooldownDuration(hintedMs: Optional<number>): number {
  if (hintedMs === undefined) {
    return LLM_AGENT_COOLDOWN;
  }

  return Math.min(hintedMs + LLM_RETRY_DELAY_SAFETY_MARGIN, LLM_MAX_AGENT_COOLDOWN);
}

/**
 * A model that rejects thinking config at all (a Lite tier, in Gemini's case)
 * answers 400 with the reason named in the message — there is no dedicated
 * error shape for it, so this is a narrow text match rather than a `status`
 * check like `isRateLimitError`'s.
 */
function isThinkingRejectedError(error: unknown): boolean {
  return (
    isRecord(error) &&
    error.status === 400 &&
    typeof error.message === "string" &&
    /thinking/i.test(error.message)
  );
}

/**
 * The asker left the picker at 기본 — Flash-Lite's own reasoning is weak enough
 * that a question of any real length still benefits from `high` over whatever
 * the model would otherwise default to.
 */
function toAutoThinkingLevel(agent: LlmAgent, question: string): Optional<LlmThinkingLevel> {
  return agent.provider === "gemini" &&
    Buffer.byteLength(question, "utf8") >= GEMINI_AUTO_HIGH_THINKING_MIN_QUESTION_BYTES
    ? "high"
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
