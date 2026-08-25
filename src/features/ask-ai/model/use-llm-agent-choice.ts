"use client";

import { request } from "@/shared/api";
import {
  CHAT_AI_AGENTS_PATH,
  llmAgentOptionsSchema,
  type LlmAgentOption,
  type LlmThinkingLevel,
} from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { useCallback, useEffect, useState } from "react";

const MODEL_STORAGE_KEY = "jandh:ai-model";
const THINKING_STORAGE_KEY = "jandh:ai-thinking";

export type LlmAgentChoice = {
  /** Empty until the fetch answers — the pickers fall back to 자동/기본 alone until then. */
  agents: LlmAgentOption[];
  /** `null` is 자동 (server picks by priority). */
  model: Nullable<string>;
  /** `null` is 기본. */
  thinking: Nullable<LlmThinkingLevel>;
  setModel: (model: Nullable<string>) => void;
  setThinking: (thinking: Nullable<LlmThinkingLevel>) => void;
};

/**
 * REQUIREMENTS.md § 8.5. The AI selection bar's model and thinking-level pickers —
 * loaded once per AI 질문 모드 entry and persisted across sessions in `localStorage`.
 *
 * WARN: `isActive` gates the fetch rather than a mount/unmount of this hook, since
 * `chat-room.tsx` calls it unconditionally alongside `useAiSelection` — refetching
 * on every entry is deliberate (REQUIREMENTS.md § 8.5.) and cheap enough not to cache
 * across them.
 */
export function useLlmAgentChoice(isActive: boolean): LlmAgentChoice {
  const [agents, setAgents] = useState<LlmAgentOption[]>([]);
  const [model, setModelState] = useState<Nullable<string>>(() => readStorage(MODEL_STORAGE_KEY));
  const [thinking, setThinkingState] = useState<Nullable<LlmThinkingLevel>>(() =>
    toThinkingLevel(readStorage(THINKING_STORAGE_KEY)),
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let cancelled = false;

    void loadAgentOptions()
      .then((loaded) => {
        if (cancelled) {
          return;
        }

        setAgents(loaded);
        // WARN: A stored model the fetched list no longer names falls back to 자동 rather than sending a request the route would refuse.
        setModelState((current) =>
          current && loaded.some((agent) => agent.model === current) ? current : null,
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isActive]);

  const setModel = useCallback((next: Nullable<string>) => {
    setModelState(next);
    writeStorage(MODEL_STORAGE_KEY, next);
  }, []);

  const setThinking = useCallback((next: Nullable<LlmThinkingLevel>) => {
    setThinkingState(next);
    writeStorage(THINKING_STORAGE_KEY, next);
  }, []);

  return { agents, model, thinking, setModel, setThinking };
}

async function loadAgentOptions(): Promise<LlmAgentOption[]> {
  const response = await request(CHAT_AI_AGENTS_PATH);

  if (!response.ok) {
    throw new Error(`GET ${CHAT_AI_AGENTS_PATH} responded ${response.status}`);
  }

  return llmAgentOptionsSchema.parse(await response.json()).agents;
}

function toThinkingLevel(value: Nullable<string>): Nullable<LlmThinkingLevel> {
  return value === "low" || value === "high" ? value : null;
}

// WARN: Try/catch throughout — a private window or a browser that refuses storage access must not turn a picker into a thrown render.
function readStorage(key: string): Nullable<string> {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: Nullable<string>): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // WARN: Nothing to recover into — the picker still works for the length of the tab, and the next visit just falls back to 자동/기본 again.
  }
}
