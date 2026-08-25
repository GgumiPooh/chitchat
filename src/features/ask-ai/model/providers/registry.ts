import "server-only";

import type { Optional } from "@/shared/lib";
import type { LlmProvider } from "../provider";
import { geminiProvider } from "./gemini";

const PROVIDERS: Record<string, LlmProvider> = {
  gemini: geminiProvider,
};

/** `llm_agents.provider` → its implementation. `undefined` for a row naming a provider this deployment has no code for. */
export function getProvider(provider: string): Optional<LlmProvider> {
  return PROVIDERS[provider];
}
