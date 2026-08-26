import "server-only";

import {
  LLM_GENERATION_LOCK_KEY,
  llmCancelEventSchema,
  type LlmThinkingLevel,
} from "@/shared/config";
import { LLM_CANCEL_CHANNEL, openUnpooledSession } from "@/shared/db";
import { safelyGet, type MessageId, type Optional, type UserId } from "@/shared/lib";
import {
  beginQueuedGeneration,
  discardGeneration,
  getGenerationSnapshot,
  markGenerationCancelled,
} from "./generation-registry";
import { publishStreamEvent } from "./publish-stream-event";
import { runGeneration, type RunGenerationResult } from "./run-generation";

export type RunQueuedGenerationParams = {
  streamId: string;
  questionClientMsgId: string;
  askerId: UserId;
  question: string;
  messageIds: MessageId[];
  /** The model the user picked, if any — tried first, ahead of the rest of the fallback chain. */
  pinnedModel: Optional<string>;
  thinking: Optional<LlmThinkingLevel>;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기, snapshotted by the route at request time — rides every published event and the eventual `assistant_reply` row, so `GET /api/chat/stream` can withhold both from the other participant. */
  onlyMe: boolean;
};

/**
 * The whole request lifecycle around `runGeneration`: a global FIFO ahead of it,
 * and cancellation around it — both keyed off one dedicated connection this
 * invocation holds open for as long as it runs.
 *
 * WARN: The FIFO is a `pg_advisory_lock`, not a queue table. Every concurrent
 * question — this asker re-asking, or the other participant asking at the same
 * time — blocks on the same lock key, and Postgres grants waiters roughly in
 * arrival order; there is nothing else here that orders them.
 */
export async function runQueuedGeneration({
  streamId,
  questionClientMsgId,
  askerId,
  question,
  messageIds,
  pinnedModel,
  thinking,
  onlyMe,
}: RunQueuedGenerationParams): Promise<RunGenerationResult> {
  const session = openUnpooledSession();
  const abortController = new AbortController();
  // WARN: Read *and* written from the `LISTEN` callback below, which fires on Node's event loop independent of whatever `await` this function is sitting on — that is what lets a cancel arrive while the advisory lock query is still outstanding.
  let cancelledWhileWaiting = false;

  beginQueuedGeneration(streamId, questionClientMsgId, askerId, onlyMe);

  try {
    // WARN: Registered before the `queued` event publishes, for the same reason the SSE stream registers its own `LISTEN` before its replay query — a cancel sent the instant after `queued` reaches the client must not land in the gap.
    // INFO: `postgres.js` gives `listen()` a dedicated `max: 1` connection of its own, so a cancel is delivered while this session is still blocked inside the advisory lock below — no round trip here has to make room for it.
    await session.listen(LLM_CANCEL_CHANNEL, (payload) => {
      const cancel = llmCancelEventSchema.safeParse(safelyGet(() => JSON.parse(payload)));

      if (cancel.success && cancel.data.streamId === streamId) {
        cancelledWhileWaiting = true;
        markGenerationCancelled(streamId);
        abortController.abort();
      }
    });

    await publishStreamEvent({
      type: "queued",
      streamId,
      questionClientMsgId,
      userId: askerId,
      onlyMe,
    });

    // WARN: Blocks server-side until granted — this is the FIFO. `maxDuration` on the route is what bounds how long an invocation may sit here.
    await session`select pg_advisory_lock(${LLM_GENERATION_LOCK_KEY}::bigint)`;

    const isCancelled = () =>
      cancelledWhileWaiting || Boolean(getGenerationSnapshot(streamId)?.cancelled);

    if (isCancelled()) {
      await publishStreamEvent({
        type: "end",
        streamId,
        questionClientMsgId,
        userId: askerId,
        stopped: true,
        onlyMe,
      });

      return { status: "cancelled" };
    }

    return await runGeneration({
      streamId,
      questionClientMsgId,
      askerId,
      question,
      messageIds,
      pinnedModel,
      thinking,
      onlyMe,
      abortSignal: abortController.signal,
      isCancelled,
    });
  } catch (error) {
    // WARN: Everything inside `runGeneration` that runs outside its own per-agent `try` — building the prompt, listing candidates, the insert, a publish — throws straight through here rather than resolving to `{ status: "failed" }`. Without this catch that leaves the registry entry stuck at `queued`/`running` forever and no terminal event ever reaches a listening client.
    console.error("[ask-ai] runQueuedGeneration failed", error);
    // WARN: Best-effort — a publish that itself fails must not mask the error that got us here.
    await publishStreamEvent({
      type: "error",
      streamId,
      questionClientMsgId,
      userId: askerId,
      onlyMe,
    }).catch(() => undefined);

    return { status: "failed" };
  } finally {
    // WARN: Unconditional, and safe to call twice — every return and throw above must leave no entry behind, including the "cancelled while queued" branch, which already left the registry clean before this ran.
    discardGeneration(streamId);

    await session`select pg_advisory_unlock(${LLM_GENERATION_LOCK_KEY}::bigint)`.catch(
      () => undefined,
    );
    await session.end().catch(() => undefined);
  }
}
