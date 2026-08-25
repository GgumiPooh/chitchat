"use client";

import { useChatStream } from "@/features/chat-stream";
import { LlmSystemPromptSheet } from "@/features/llm-system-prompt";
import type { Nullable } from "@/shared/lib";
import { SettingsRow } from "@/shared/ui";
import { ScrollText } from "lucide-react";
import { useState } from "react";

/**
 * REQUIREMENTS.md § 8.15. The shared 쨈미니 지침, mirrored from the composer's own
 * `AI 지침` chip (`AiSelectionBar`) — a Settings row of its own for the reason
 * `ChatBackgroundRow` (§ 12.2.) is: it belongs to the conversation, not to either
 * profile, and either participant may open and change it from here.
 */
export function LlmSystemPromptSettingsRow() {
  const { llmSystemPrompt, setLlmSystemPrompt } = useChatStream();
  // WARN: `EventFormSheet`'s pattern — bumped on every open so the sheet remounts and re-seeds its draft from whatever the prompt is *now*, rather than from a stale value this screen was rendered with.
  const [openToken, setOpenToken] = useState<Nullable<number>>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <SettingsRow
        label="AI 지침"
        description={toDescription(llmSystemPrompt)}
        Icon={ScrollText}
        haptic
        onClick={() => {
          setOpenToken((token) => (token ?? 0) + 1);
          setIsOpen(true);
        }}
      />
      <LlmSystemPromptSheet
        key={openToken}
        isOpen={isOpen}
        initialPrompt={llmSystemPrompt}
        onClose={() => setIsOpen(false)}
        onSaved={setLlmSystemPrompt}
      />
    </>
  );

  function toDescription(prompt: Nullable<string>): string {
    return prompt?.split("\n")[0]?.slice(0, SETTINGS_ROW_DESCRIPTION_MAX_LENGTH) || "지침 없음";
  }
}

const SETTINGS_ROW_DESCRIPTION_MAX_LENGTH = 40;
