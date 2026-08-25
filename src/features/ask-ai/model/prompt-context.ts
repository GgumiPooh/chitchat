export type PromptAttachment = {
  bytes: Uint8Array;
  mime: string;
};

/** One selected message, resolved to what a provider can actually read. */
export type PromptContextEntry = {
  senderName: string;
  /** `"assistant"` for the AI's own past answer, so a provider that supports multi-turn history can read it back as its own words rather than the asker's. Always `"user"` otherwise — a bubble is never labeled by the *other* participant either, since the model reads both sides of the conversation as one party asking it something. */
  role: "user" | "assistant";
  /** Empty when the message is attachments only. */
  text: string;
  attachments: PromptAttachment[];
};

/** Provider-agnostic input to `LlmProvider.streamAnswer` — oldest entry first. */
export type PromptContext = {
  question: string;
  entries: PromptContextEntry[];
};
