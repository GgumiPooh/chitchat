import type { LlmThinkingLevel } from "@/shared/config";
import type { Optional } from "@/shared/lib";
import type { PromptContext } from "./prompt-context";

export type StreamAnswerParams = {
  model: string;
  apiKey: string;
  /** `llm_agents.config` — provider-specific knobs, opaque to everything but the provider that reads it. */
  config: unknown;
  context: PromptContext;
  /** REQUIREMENTS.md § 8.15. The shared `couple_settings.llm_system_prompt`, or `undefined` when none is set — a provider that takes a `systemInstruction` knob merges this ahead of its own built-in one. */
  systemPrompt: Optional<string>;
  /** Aborted the moment `DELETE /api/chat/ai` cancels this streamId — a provider that can stop its own request mid-flight (Gemini's own `config.abortSignal`) should. */
  abortSignal: AbortSignal;
  /** The user's pick, if any — a provider maps this onto its own thinking/reasoning knob and merges it over anything the row's own `config` already set for it. */
  thinking: Optional<LlmThinkingLevel>;
};

/**
 * One provider in the fallback chain. `gemini` is the only implementation today;
 * a second provider is a new file here plus a row in `llm_agents` — no migration
 * and no change to the runner.
 */
export type LlmProvider = {
  /** Yields text deltas as they arrive; throws (an `ApiError`-shaped error, ideally) on failure so the runner can try the next agent. */
  streamAnswer(params: StreamAnswerParams): AsyncIterable<string>;
  /**
   * Milliseconds to wait before this agent is worth trying again, read out of a
   * caught 429's own hint (Gemini's `RetryInfo` detail) — `undefined` when the
   * error carries none, which the runner then covers with `LLM_AGENT_COOLDOWN`'s
   * flat default. Every provider implements this, even one whose SDK has no
   * such hint to offer, so the runner never special-cases a provider that lacks
   * it.
   */
  toRetryDelay(error: unknown): Optional<number>;
};
