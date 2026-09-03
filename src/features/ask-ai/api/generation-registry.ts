import "server-only";

import type { Nullable, Optional, UserId } from "@/shared/lib";

export type GenerationStatus = "queued" | "running";

export type GenerationSnapshot = {
  status: GenerationStatus;
  questionClientMsgId: string;
  userId: UserId;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — `GET /api/chat/stream` withholds this run's snapshot/backfill from every session but `userId`'s own when true. */
  onlyMe: boolean;
  /** REQUIREMENTS.md § 16.1., § 8.15. 조용히 보내기 — carried the same way `onlyMe` is, for the streaming footer's dashed look and the eventual `assistant_reply` row. */
  silent: boolean;
  provider: Optional<string>;
  model: Optional<string>;
  /** Everything streamed so far — what a client connecting mid-stream backfills its bubble from. */
  text: string;
  /** The `seq` a joining client should expect its next `delta` to carry — advanced only at flush time, together with `text`, so the two never disagree about how far the stream has actually gotten published. */
  nextSeq: number;
  done: boolean;
  /** Set once every agent has failed; `text` is whatever partial answer was streamed before the run gave up. */
  failed: boolean;
  /** Set by `DELETE /api/chat/ai`'s same-process fast path — `runGeneration` also learns of a cancel cross-process, through its own `LISTEN` on `LLM_CANCEL_CHANNEL`, but checks this too rather than trusting only the network round trip. */
  cancelled: boolean;
};

// WARN: Dev HMR re-evaluates this module; without the global every reload drops runs already in flight. On Vercel this map is simply empty across invocations — a newly connected SSE client then backfills nothing beyond whatever the `pg_notify` replay already delivered.
const globalForRegistry = globalThis as typeof globalThis & {
  jandhLlmRuns?: Map<string, GenerationSnapshot>;
};

function registry(): Map<string, GenerationSnapshot> {
  return (globalForRegistry.jandhLlmRuns ??= new Map());
}

/** What the SSE route hands a client that connects mid-queue or mid-stream — the run's progress so far. */
export function getGenerationSnapshot(streamId: string): Nullable<GenerationSnapshot> {
  return registry().get(streamId) ?? null;
}

/**
 * Every run still in the registry, oldest first — what a client connecting cold
 * enumerates to draw every question currently queued or streaming, not just one
 * it already knows the `streamId` for.
 *
 * INFO: Insertion order, for free — a `Map` iterates in the order its keys were
 * first set, and `beginQueuedGeneration` is the only inserter, called in queue
 * order.
 */
export function listGenerationSnapshots(): Array<GenerationSnapshot & { streamId: string }> {
  return Array.from(registry(), ([streamId, snapshot]) => ({ streamId, ...snapshot }));
}

/** The request has been admitted to the queue, before the advisory lock is even requested. */
export function beginQueuedGeneration(
  streamId: string,
  questionClientMsgId: string,
  userId: UserId,
  onlyMe: boolean,
  silent: boolean,
): void {
  registry().set(streamId, {
    status: "queued",
    questionClientMsgId,
    userId,
    onlyMe,
    silent,
    provider: undefined,
    model: undefined,
    text: "",
    nextSeq: 0,
    done: false,
    failed: false,
    cancelled: false,
  });
}

/**
 * The advisory lock was granted and one agent is now actually streaming — resets
 * `text` in the same call, since a fallback landing here means whatever the
 * previous agent streamed belongs to an attempt this run has abandoned.
 */
export function markGenerationRunning(streamId: string, provider: string, model: string): void {
  const entry = registry().get(streamId);

  if (entry) {
    entry.status = "running";
    entry.provider = provider;
    entry.model = model;
    entry.text = "";
  }
}

/**
 * Called once per published `delta`, with the exact `seq` and text that chunk
 * carried — never per raw provider token. Appending here ahead of the actual
 * publish would let a snapshot describe a stream state the `pg_notify` side has
 * not caught up to yet, which is what left a joining client's reorder buffer
 * stuck waiting on a `delta` the registry had already folded in.
 */
export function appendGenerationChunk(streamId: string, seq: number, text: string): void {
  const entry = registry().get(streamId);

  if (entry) {
    entry.text += text;
    entry.nextSeq = seq + 1;
  }
}

export function endGeneration(streamId: string): void {
  const entry = registry().get(streamId);

  if (entry) {
    entry.done = true;
  }
}

export function failGeneration(streamId: string): void {
  const entry = registry().get(streamId);

  if (entry) {
    entry.done = true;
    entry.failed = true;
  }
}

/** `DELETE /api/chat/ai`'s same-process fast path. */
export function markGenerationCancelled(streamId: string): void {
  const entry = registry().get(streamId);

  if (entry) {
    entry.cancelled = true;
  }
}

/** Frees the entry once the run has finished — the runner calls this after publishing `end`/`error`. */
export function discardGeneration(streamId: string): void {
  registry().delete(streamId);
}
