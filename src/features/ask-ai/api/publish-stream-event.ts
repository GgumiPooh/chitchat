import "server-only";

import { llmStreamEventSchema, type LlmStreamEvent } from "@/shared/config";
import { LLM_STREAM_CHANNEL, notifyChannel } from "@/shared/db";

/**
 * Publishes one `llm_stream` event, validated the same way `publishTyping` is
 * (`typingEventSchema`) — a payload that stops matching the schema fails closed
 * on the client rather than throwing here.
 */
export async function publishStreamEvent(event: LlmStreamEvent): Promise<void> {
  await notifyChannel(LLM_STREAM_CHANNEL, JSON.stringify(llmStreamEventSchema.parse(event)));
}
