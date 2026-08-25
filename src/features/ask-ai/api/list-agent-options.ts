import "server-only";

import type { LlmAgentOption } from "@/shared/config";
import { getDb, llmAgents } from "@/shared/db";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Every distinct (provider, model) an enabled row offers, for the composer's own
 * picker — `disabled_until` is ignored here on purpose, since a key cooling down
 * from a 429 is still a model the user may legitimately choose; the fallback
 * chain is what actually skips it until the cooldown lapses.
 */
export async function listAgentOptions(): Promise<LlmAgentOption[]> {
  const maxPriority = sql<number>`max(${llmAgents.priority})`;

  const rows = await getDb()
    .select({ provider: llmAgents.provider, model: llmAgents.model, maxPriority })
    .from(llmAgents)
    .where(eq(llmAgents.enabled, true))
    .groupBy(llmAgents.provider, llmAgents.model)
    .orderBy(desc(maxPriority), llmAgents.model);

  return rows.map(({ provider, model }) => ({ provider, model }));
}
