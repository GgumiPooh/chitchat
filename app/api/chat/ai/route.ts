import { toSingleMessagePayload } from "@/entities/message";
import { markGenerationCancelled, runQueuedGeneration } from "@/features/ask-ai";
import { notifyAssistantReply } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  llmThinkingLevelSchema,
  MAX_AI_CONTEXT_MESSAGES,
  MAX_AI_QUESTION_LENGTH,
  SILENT_SEND_COOKIE_NAME,
  snowflakeSchema,
} from "@/shared/config";
import { LLM_CANCEL_CHANNEL, notifyChannel } from "@/shared/db";
import { safelyRunAsync, type MessageId, type Optional } from "@/shared/lib";
import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { z } from "zod";

// WARN: A cancelled-but-queued request still holds this connection for as long as it waits on the advisory lock — this bounds that wait the same way it bounds the fallback chain across a 429 and a retry.
export const runtime = "nodejs";

export const maxDuration = 300;

const postBodySchema = z.object({
  // INFO: The client mints this and reuses it as `messages.client_msg_id`, so its own streaming bubble dedups against the row this request eventually inserts.
  streamId: z.uuid(),
  // INFO: The `client_msg_id` of the question bubble the user already sent through the normal send path — carried on every published event so a client ties queue/stream state back to it.
  questionClientMsgId: z.uuid(),
  question: z.string().trim().min(1).max(MAX_AI_QUESTION_LENGTH),
  messageIds: z.array(snowflakeSchema<MessageId>()).max(MAX_AI_CONTEXT_MESSAGES),
  // INFO: Absent means the model's own default — nothing provider-specific is sent for either field unless the user picked one.
  model: z.string().min(1).max(200).optional(),
  thinking: llmThinkingLevelSchema.optional(),
});

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = postBodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 16.1. Snapshotted here, at request time — a queued question keeps whatever 조용히 보내기 was set to when it was asked, not whatever it becomes while waiting on the FIFO.
  const isSilent = (await cookies()).get(SILENT_SEND_COOKIE_NAME)?.value === "true";

  const result = await runQueuedGeneration({
    streamId: body.data.streamId,
    questionClientMsgId: body.data.questionClientMsgId,
    askerId: user.id,
    question: body.data.question,
    messageIds: body.data.messageIds,
    pinnedModel: body.data.model,
    thinking: body.data.thinking,
  });

  if (result.status === "answered") {
    // INFO: REQUIREMENTS.md § 8.15., § 16.1. Unlike an ordinary send, the asker is pushed too — they are `sender_id` on this row but may have left the app while the answer streamed.
    after(() => safelyRunAsync(() => notifyAssistantReply(result.message, user.id, isSilent)));

    return NextResponse.json(await toSingleMessagePayload(result.message), { status: 201 });
  }

  // INFO: A cancel that landed before any text was produced — not a failure, so it does not answer `upstream_failed`.
  if (result.status === "cancelled") {
    return NextResponse.json({ cancelled: true }, { status: 200 });
  }

  return apiError("upstream_failed");
}

const deleteBodySchema = z.object({ streamId: z.uuid() });

/**
 * Either participant may cancel — not only the one who asked, since the answer
 * is posted into a conversation both of them read.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const streamId = await resolveCancelStreamId(request);

  if (!streamId) {
    return apiError("invalid_request");
  }

  // INFO: The same-process fast path — `runQueuedGeneration`'s own `LISTEN` on `LLM_CANCEL_CHANNEL` is what actually reaches a different invocation.
  markGenerationCancelled(streamId);
  await notifyChannel(LLM_CANCEL_CHANNEL, JSON.stringify({ streamId }));

  return new NextResponse(null, { status: 204 });
}

async function resolveCancelStreamId(request: Request): Promise<Optional<string>> {
  const fromQuery = new URL(request.url).searchParams.get("streamId");

  if (fromQuery) {
    return z.uuid().safeParse(fromQuery).data;
  }

  const body = deleteBodySchema.safeParse(await request.json().catch(() => null));

  return body.success ? body.data.streamId : undefined;
}
