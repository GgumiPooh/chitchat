import { A_DAY, A_MEGABYTE, A_MINUTE, A_SECOND, type Maybe, type UserId } from "@/shared/lib";
import { z } from "zod";
import { snowflakeSchema } from "./id";

export const CHAT_AI_PATH = "/api/chat/ai";

export const CHAT_AI_AGENTS_PATH = "/api/chat/ai/agents";

export const CHAT_AI_SYSTEM_PROMPT_PATH = "/api/chat/ai/system-prompt";

export const MAX_AI_QUESTION_LENGTH = 2_000;

export const MAX_AI_CONTEXT_MESSAGES = 1_000;

// INFO: REQUIREMENTS.md § 8.15. How many past question/answer pairs every AI question carries regardless of what the asker selected — the running conversation with the model, which no selection should have to be rebuilt by hand.
export const AI_CONTEXT_EXCHANGE_COUNT = 10;

// INFO: REQUIREMENTS.md § 8.15. The shared `chat_settings.llm_system_prompt` — long enough for a real set of standing instructions, short enough to stay well under Gemini's own `systemInstruction` limits.
export const MAX_LLM_SYSTEM_PROMPT_LENGTH = 4_000;

export const LLM_THINKING_LEVELS = ["low", "high"] as const;

export const llmThinkingLevelSchema = z.enum(LLM_THINKING_LEVELS);

export type LlmThinkingLevel = z.infer<typeof llmThinkingLevelSchema>;

export const LLM_INLINE_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

// INFO: `video/quicktime` alongside it — the app's own `ALLOWED_VIDEO_MIMES` stores an iPhone `.mov` under that name, and Gemini reads it as the `video/mov` in its own list.
export const LLM_INLINE_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"] as const;

// WARN: Deliberately narrower than `ALLOWED_VIDEO_MIMES`/`VOICE_MIMES` — this app stores whatever a browser recorded (REQUIREMENTS.md § 9.3.), and a voice message's `audio/mp4`/`audio/webm` container is not one of these. A voice clip almost always falls back to its text description for exactly that reason.
export const LLM_INLINE_AUDIO_MIMES = [
  "audio/wav",
  "audio/mp3",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/mpeg",
  "audio/m4a",
  "audio/opus",
] as const;

export const LLM_INLINE_FILE_MIMES = ["application/pdf", "text/plain"] as const;

/** Whether Gemini accepts `mime` as an inline attachment at all — independent of the size budget below. */
export function isLlmInlineMime(mime: string): boolean {
  return (
    (LLM_INLINE_IMAGE_MIMES as readonly string[]).includes(mime) ||
    (LLM_INLINE_VIDEO_MIMES as readonly string[]).includes(mime) ||
    (LLM_INLINE_AUDIO_MIMES as readonly string[]).includes(mime) ||
    (LLM_INLINE_FILE_MIMES as readonly string[]).includes(mime)
  );
}

// INFO: Gemini's ~20MB cap is on the wire request, which is base64 — this is the raw-byte budget that keeps the encoded payload safely under it once the ~4/3 inflation and the surrounding JSON are accounted for. Shared across every attachment in one question, not per-attachment; an item that would push the running total past it falls back to its text description instead.
export const LLM_INLINE_REQUEST_MAX_BYTES = 14 * A_MEGABYTE;

// INFO: Stamped on `llm_agents.disabled_until` after a 429 that carries no retry hint of its own. A 429 can mean two different limits — RPM (requests per minute) clears within the same minute, RPD (requests per day) does not clear until the provider's next day — and only a per-error hint tells them apart, so this flat fallback assumes the cheaper one.
export const LLM_AGENT_COOLDOWN = A_MINUTE;

// INFO: Added to a provider-hinted retry delay before it is stamped, since the hint names the instant the provider itself expects to start accepting requests again, not the instant a retry is guaranteed to succeed.
export const LLM_RETRY_DELAY_SAFETY_MARGIN = 5 * A_SECOND;

// WARN: A ceiling on the *hinted* delay only — an RPD exhaustion can legitimately name a delay this long, but a provider bug or a malformed hint must not stamp a cooldown the fallback chain can never recover from on its own.
export const LLM_MAX_AGENT_COOLDOWN = A_DAY;

// INFO: How often a run flushes its buffered delta as one `pg_notify`, rather than one notification per streamed token.
export const LLM_STREAM_COALESCE_INTERVAL = A_SECOND * 0.15;

// WARN: `NOTIFY`'s own hard cap on the whole published payload.
export const LLM_NOTIFY_MAX_BYTES = 8_000;

// INFO: Reserved beyond the envelope size a `delta` publish actually measures at call time — covers drift the measurement does not (a wider `seq` digit count, a future field) rather than being budgeted away from every chunk in advance.
export const LLM_NOTIFY_SAFETY_MARGIN = 200;

// INFO: `pg_advisory_lock`'s key — one arbitrary constant naming the whole app's single AI-generation queue. Nothing else in the app takes an advisory lock, so any fixed 63-bit value works; this one has no meaning beyond being unlikely to be typed by accident.
export const LLM_GENERATION_LOCK_KEY = 954_823_671;

const llmStreamEventBase = {
  streamId: z.uuid(),
  // INFO: The `messages.client_msg_id` of the question the user sent through the normal send path — what a client ties a queue/stream event back to the bubble it belongs to.
  questionClientMsgId: z.uuid(),
  userId: snowflakeSchema<UserId>(),
};

/**
 * The `llm_stream` payload, on the `pg_notify` hop and on the wire alike —
 * mirrors `typingEventSchema`'s role for the `typing` channel.
 */
export const llmStreamEventSchema = z.discriminatedUnion("type", [
  // INFO: Published the moment a request is admitted to the queue, before the advisory lock is even requested — a client waiting behind another question renders 대기 중 off this rather than off silence.
  z.object({ type: z.literal("queued"), ...llmStreamEventBase }),
  // INFO: `seq` is the one the attempt's first `delta` will carry — the counter runs across the whole run, so a fallback's `start` does not restart it at 0 and a client must not either.
  z.object({
    type: z.literal("start"),
    ...llmStreamEventBase,
    provider: z.string(),
    model: z.string().optional(),
    seq: z.number().int().nonnegative().optional(),
  }),
  // INFO: `seq` orders deltas that a slow client's `pg_notify` delivery can reorder in transit.
  z.object({
    type: z.literal("delta"),
    ...llmStreamEventBase,
    seq: z.number().int().nonnegative(),
    text: z.string(),
  }),
  // INFO: `stopped` rides only on a cancellation — the ordinary case leaves it undefined rather than `false`, so a client checking `event.stopped` needs no fallback logic.
  z.object({ type: z.literal("end"), ...llmStreamEventBase, stopped: z.literal(true).optional() }),
  z.object({ type: z.literal("error"), ...llmStreamEventBase }),
]);

export type LlmStreamEvent = z.infer<typeof llmStreamEventSchema>;

/** The `llm_cancel` payload — deliberately smaller than a stream event, since every listener already knows who is asking from the `queued`/`start` it already saw. */
export const llmCancelEventSchema = z.object({ streamId: z.uuid() });

export type LlmCancelEvent = z.infer<typeof llmCancelEventSchema>;

/**
 * One selectable (provider, model) pair, as `GET /api/chat/ai/agents` answers
 * it — never the row's `api_key`, `config`, or id; a picker has no business with
 * any of the three.
 */
export const llmAgentOptionSchema = z.object({ provider: z.string(), model: z.string() });

export type LlmAgentOption = z.infer<typeof llmAgentOptionSchema>;

export const llmAgentOptionsSchema = z.object({ agents: z.array(llmAgentOptionSchema) });

export type LlmAgentOptions = z.infer<typeof llmAgentOptionsSchema>;

/**
 * What `GET /api/chat/stream` actually writes on `event: llm` — every
 * `llmStreamEventSchema` variant, plus `snapshot`: a client connecting mid-queue
 * or mid-stream enumerates `listGenerationSnapshots()` and gets one of these per
 * run already in flight, in place of the `queued`/`start`/`delta`s it missed.
 */
export const llmSseEventSchema = z.discriminatedUnion("type", [
  ...llmStreamEventSchema.options,
  z.object({
    type: z.literal("snapshot"),
    ...llmStreamEventBase,
    status: z.enum(["queued", "running"]),
    provider: z.string().optional(),
    model: z.string().optional(),
    text: z.string(),
    // INFO: The `seq` a joining client's next `delta` should carry — without it a client starting its reorder buffer at 0 holds every real delta (seq ≥ this) waiting on ones that already landed in `text`.
    seq: z.number().int().nonnegative(),
  }),
]);

export type LlmSseEvent = z.infer<typeof llmSseEventSchema>;

/** After `end`/`stopped`, how long a client waits for the `assistant_reply` echo before dropping the streaming row on its own — a run that finished writing but whose `new_message` was itself dropped by the stream must not leave the bubble up forever. */
export const LLM_ECHO_TIMEOUT = 5 * A_SECOND;

export type LlmProviderBranding = {
  name: string;
  /** REQUIREMENTS.md § 8.5. The provider's own plain name — `Gemini`, never `쨈미니` — for the model picker row alone; every other surface (the bubble, the profile, the push title, the live region) reads `name`. */
  label: string;
  avatarSrc?: string;
  backgroundSrc?: string;
};

// INFO: One entry per `llm_agents.provider` string — a new provider is one line here, read by both the SSE footer's avatar and (later) the finished bubble's own.
export const LLM_PROVIDER_BRANDING: Record<string, LlmProviderBranding> = {
  gemini: {
    name: "쨈미니",
    label: "Gemini",
    avatarSrc: "/llm/gemini-avatar.png",
    backgroundSrc: "/llm/gemini-background.png",
  },
};

// INFO: A generation not yet past `start` carries no provider yet, and an unrecognised one should still render something rather than nothing.
export const LLM_PROVIDER_FALLBACK_BRANDING: LlmProviderBranding = { name: "AI", label: "AI" };

// WARN: `Maybe`, not `Optional` — `GenerationEntry.provider` (the streaming row) is `Optional<string>` and `ChatMessage.llmProvider` (the finished row) is `Nullable<string>`, and this reads both.
export function toLlmProviderBranding(provider: Maybe<string>): LlmProviderBranding {
  if (!provider) {
    return LLM_PROVIDER_FALLBACK_BRANDING;
  }

  // INFO: A row naming a provider this deployment has no branding entry for still needs a `label` for the picker row — the raw provider id is what `llm_agents.provider` actually holds, so it reads as that rather than a bare `AI`.
  return LLM_PROVIDER_BRANDING[provider] ?? { name: "AI", label: provider };
}
