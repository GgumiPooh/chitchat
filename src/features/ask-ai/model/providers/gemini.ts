import "server-only";

import { A_SECOND, safelyGet, type Optional } from "@/shared/lib";
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type Part,
} from "@google/genai";
import type { PromptContext } from "../prompt-context";
import type { LlmProvider, StreamAnswerParams } from "../provider";

export const geminiProvider: LlmProvider = {
  streamAnswer,
  toRetryDelay,
};

async function* streamAnswer({
  model,
  apiKey,
  config,
  context,
  systemPrompt,
  abortSignal,
  thinking,
}: StreamAnswerParams): AsyncIterable<string> {
  const ai = new GoogleGenAI({ apiKey });
  const rowConfig = config as Optional<GenerateContentConfig>;
  const response = await ai.models.generateContentStream({
    model,
    contents: toContents(context),
    config: {
      // INFO: `llm_agents.config` — temperature, safety settings, and anything else Gemini's own `GenerateContentConfig` accepts, forwarded as-is.
      ...rowConfig,
      // INFO: REQUIREMENTS.md § 8.15. The shared standing instruction, ahead of anything the row's own `config.systemInstruction` already set — a reader who has written one means it, and the fallback chain's other agents get the same treatment.
      ...(systemPrompt && { systemInstruction: systemPrompt }),
      abortSignal,
      // WARN: Overrides the row's own `thinkingConfig` only when the user actually picked a level — `undefined` here leaves `rowConfig.thinkingConfig` (if any) standing, since the spread above already applied it.
      ...(thinking && {
        thinkingConfig: {
          ...rowConfig?.thinkingConfig,
          thinkingLevel: thinking === "high" ? ThinkingLevel.HIGH : ThinkingLevel.LOW,
        },
      }),
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

/**
 * `@google/genai`'s `ApiError` exposes only `status` and `message` — no parsed
 * headers or body — and `message` is the raw JSON response body Gemini sent,
 * stringified. This digs the `google.rpc.RetryInfo` detail back out of it
 * defensively: any shape that does not match answers `undefined` rather than
 * throwing, since a parse failure here must not be what breaks the fallback
 * chain's own error handling.
 */
function toRetryDelay(error: unknown): Optional<number> {
  const message = isRecord(error) && typeof error.message === "string" ? error.message : undefined;

  if (!message) {
    return undefined;
  }

  const jsonStart = message.indexOf("{");
  const body = jsonStart === -1 ? undefined : safelyGet(() => JSON.parse(message.slice(jsonStart)));
  const details = isRecord(body) && isRecord(body.error) ? body.error.details : undefined;

  if (!Array.isArray(details)) {
    return undefined;
  }

  const retryInfo = details.find(
    (detail) => isRecord(detail) && String(detail["@type"]).includes("RetryInfo"),
  );
  const retryDelay = isRecord(retryInfo) ? retryInfo.retryDelay : undefined;
  const seconds = typeof retryDelay === "string" ? /^([\d.]+)s$/.exec(retryDelay) : null;

  return seconds ? Math.round(Number(seconds[1]) * A_SECOND) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * One turn per run of same-role entries (Gemini's own history format wants
 * alternating `user`/`model` turns), so the AI's own past answers read back as
 * its own words rather than the asker's — which is the whole point of carrying
 * roles at all. Falls back to the single flattened `user` turn `toParts` built
 * when the entries would not start on a `user` turn, since a history that opens
 * on `model` is not a shape Gemini expects and is not worth the branch.
 */
function toContents(context: PromptContext): Content[] {
  const contents: Content[] = [];

  for (const entry of context.entries) {
    const role = entry.role === "assistant" ? "model" : "user";
    const parts = toEntryParts(entry.senderName, entry.text, entry.attachments);

    if (parts.length === 0) {
      continue;
    }

    const last = contents.at(-1);

    if (last?.role === role) {
      last.parts?.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  const questionPart: Part = { text: `질문: ${context.question}` };
  const last = contents.at(-1);

  if (last?.role === "user") {
    last.parts?.push(questionPart);
  } else {
    contents.push({ role: "user", parts: [questionPart] });
  }

  return contents[0]?.role === "user" ? contents : [{ role: "user", parts: toParts(context) }];
}

function toEntryParts(
  senderName: string,
  text: string,
  attachments: PromptContext["entries"][number]["attachments"],
): Part[] {
  const parts: Part[] = [];

  if (text) {
    parts.push({ text: `${senderName}: ${text}` });
  }

  for (const attachment of attachments) {
    parts.push({
      inlineData: {
        data: Buffer.from(attachment.bytes).toString("base64"),
        mimeType: attachment.mime,
      },
    });
  }

  return parts;
}

/** The fallback layout: everything folded into one `user` turn, labeled by sender inline — what every context used to look like before roles. */
function toParts(context: PromptContext): Part[] {
  const parts: Part[] = [];

  for (const entry of context.entries) {
    parts.push(...toEntryParts(entry.senderName, entry.text, entry.attachments));
  }

  parts.push({ text: `질문: ${context.question}` });

  return parts;
}
