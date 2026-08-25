import "server-only";

import { getDb, llmAgents, type LlmAgent } from "@/shared/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

/**
 * The fallback chain for one question — enabled agents whose 429 cooldown has
 * either never been stamped or has already lapsed, tried highest priority first
 * and ties broken deterministically by the row's own key.
 *
 * INFO: `pinnedModel` moves every candidate carrying that model to the front,
 * still ordered the same way among themselves, and leaves the rest of the chain
 * exactly as it already was — the user's model pick is honoured first, but a
 * fallback still runs if that model's own agents all fail.
 */
export async function listCandidateAgents(pinnedModel?: string): Promise<LlmAgent[]> {
  const candidates = await getDb()
    .select()
    .from(llmAgents)
    .where(
      and(
        eq(llmAgents.enabled, true),
        or(isNull(llmAgents.disabledUntil), sql`${llmAgents.disabledUntil} <= now()`),
      ),
    )
    .orderBy(desc(llmAgents.priority), llmAgents.provider, llmAgents.model, llmAgents.apiKey);

  if (!pinnedModel) {
    return candidates;
  }

  const pinned: LlmAgent[] = [];
  const rest: LlmAgent[] = [];

  for (const candidate of candidates) {
    (candidate.model === pinnedModel ? pinned : rest).push(candidate);
  }

  return [...pinned, ...rest];
}
