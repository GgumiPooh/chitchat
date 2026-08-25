"use client";

import { MAX_LLM_SYSTEM_PROMPT_LENGTH } from "@/shared/config";
import { cn, isCommandKey, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, Textarea, toast } from "@/shared/ui";
import { useState, type KeyboardEvent } from "react";
import { saveLlmSystemPrompt } from "../api/save-llm-system-prompt";

export type LlmSystemPromptSheetProps = {
  className?: string;
  isOpen: boolean;
  /** Seeded once, at mount — the caller remounts this with a fresh `key` on every opening (`EventFormSheet`'s pattern), which is what re-seeds it from a value that may have moved while the sheet was closed. */
  initialPrompt: Nullable<string>;
  onClose: () => void;
  onSaved: (prompt: Nullable<string>) => void;
};

/**
 * REQUIREMENTS.md § 8.15. The shared 쨈미니 지침 sheet — either participant may set
 * it, and it applies to every question either of them asks.
 */
export function LlmSystemPromptSheet({
  className,
  isOpen,
  initialPrompt,
  onClose,
  onSaved,
}: LlmSystemPromptSheetProps) {
  const [draft, setDraft] = useState(initialPrompt ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const isUnchanged = draft === (initialPrompt ?? "");

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{ title: "AI 지침" }}
      onClose={onClose}
    >
      <div className="space-y-xs pt-2xs">
        <p className="text-body-sm text-body">
          AI가 답할 때마다 먼저 읽는 지침이에요. 말투, 답변 길이, 부르는 이름처럼 매번 지켰으면 하는
          것을 적어두면 두 사람의 모든 질문에 적용돼요.
        </p>
        <Textarea
          className="max-h-48 min-h-32 overflow-y-auto"
          value={draft}
          maxLength={MAX_LLM_SYSTEM_PROMPT_LENGTH}
          placeholder="AI에게 항상 적용할 지침을 적어주세요"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex items-center justify-end">
          <p className="text-caption text-meta">
            {draft.length}/{MAX_LLM_SYSTEM_PROMPT_LENGTH}
          </p>
        </div>
        <Button
          className={cn(isSaving && "opacity-60")}
          disabled={isUnchanged || isSaving}
          haptic
          onClick={() => void submit()}
        >
          저장
        </Button>
      </div>
    </BottomSheet>
  );

  // WARN: § 8.14. First, and it covers the shortcut below — a Hangul IME's Enter that settles a syllable must not also submit the sheet.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (isCommandKey(event) && event.key === "Enter" && !isUnchanged && !isSaving) {
      event.preventDefault();
      void submit();
    }
  }

  async function submit() {
    setIsSaving(true);

    try {
      const saved = await saveLlmSystemPrompt(draft);

      onSaved(saved);
      onClose();
      toast.success("AI 지침을 저장했어요");
    } catch {
      toast.error("AI 지침을 저장하지 못했어요");
    } finally {
      setIsSaving(false);
    }
  }
}
