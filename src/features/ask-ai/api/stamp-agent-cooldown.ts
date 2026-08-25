import "server-only";

import { getDb, llmAgents, type LlmAgent } from "@/shared/db";
import { and, eq } from "drizzle-orm";

/** A 429 from this agent — skip it for `durationMs` rather than retrying it on the next question. */
export async function stampAgentCooldown(
  agent: Pick<LlmAgent, "provider" | "model" | "apiKey">,
  durationMs: number,
): Promise<void> {
  await getDb()
    .update(llmAgents)
    .set({ disabledUntil: new Date(Date.now() + durationMs) })
    .where(
      and(
        eq(llmAgents.provider, agent.provider),
        eq(llmAgents.model, agent.model),
        eq(llmAgents.apiKey, agent.apiKey),
      ),
    );
}
