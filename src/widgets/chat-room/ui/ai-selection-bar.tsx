"use client";

import { useChatStream } from "@/features/chat-stream/@x/llm-system-prompt";
import { LlmSystemPromptSheet } from "@/features/llm-system-prompt";
import { toLlmProviderBranding, type LlmAgentOption, type LlmThinkingLevel } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { ActionSheet, type ActionSheetItem } from "@/shared/ui";
import { ChevronDown, ScrollText } from "lucide-react";
import { useRef, useState } from "react";

export type AiSelectionBarProps = {
  className?: string;
  /** REQUIREMENTS.md § 8.5. Empty until `useLlmAgentChoice`'s fetch answers — the chip still opens, offering only 자동 until it does. */
  agents: LlmAgentOption[];
  /** `null` is 자동. */
  model: Nullable<string>;
  /** `null` is 기본. */
  thinking: Nullable<LlmThinkingLevel>;
  onSelectModel: (model: Nullable<string>) => void;
  onSelectThinking: (thinking: Nullable<LlmThinkingLevel>) => void;
};

const THINKING_LABELS: Record<LlmThinkingLevel, string> = { low: "낮음", high: "높음" };

/**
 * DESIGN.md § 6.6., § 6.11. The AI question's picker row, in the composer pill's
 * header row — the same slot § 6.10.'s staged quote and § 6.10.1.'s edit bar
 * stand in. `{n}개 선택` and the selection toggle live in the chat header while
 * the mode is up (`ChatScreen`), not here — this bar is the three chips alone.
 *
 * WARN: One line at 360px, `모델` · `생각` · `AI 지침` in that order. The model
 * chip is the one whose label can run long (a provider's own model id), so it
 * alone truncates rather than wrapping the row to a second line.
 */
export function AiSelectionBar({
  className,
  agents,
  model,
  thinking,
  onSelectModel,
  onSelectThinking,
}: AiSelectionBarProps) {
  const [openSheet, setOpenSheet] = useState<Nullable<"model" | "thinking">>(null);
  const modelAnchorRef = useRef<Nullable<HTMLButtonElement>>(null);
  const thinkingAnchorRef = useRef<Nullable<HTMLButtonElement>>(null);
  const { llmSystemPrompt, setLlmSystemPrompt } = useChatStream();
  // WARN: `EventFormSheet`'s pattern — bumped on every open so the sheet remounts and re-seeds its draft from whatever the prompt is *now*, rather than from a `user_changed` refetch that would otherwise clobber unsaved edits while it is open.
  const [promptOpenToken, setPromptOpenToken] = useState<Nullable<number>>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  return (
    <div className={cn("flex items-center gap-2xs pt-xs pl-sm", className)}>
      <button
        ref={modelAnchorRef}
        className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-surface-soft px-xs py-1 text-button-sm text-ink transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
        type="button"
        aria-label="모델 선택"
        onClick={() => setOpenSheet("model")}
      >
        <span className="min-w-0 truncate">{model ?? "자동"}</span>
        <ChevronDown className="size-3.5 shrink-0" strokeWidth={2} />
      </button>
      <button
        ref={thinkingAnchorRef}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-soft px-xs py-1 text-button-sm text-ink transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
        type="button"
        aria-label="생각 수준 선택"
        onClick={() => setOpenSheet("thinking")}
      >
        <span>생각: {thinking ? THINKING_LABELS[thinking] : "기본"}</span>
        <ChevronDown className="size-3.5 shrink-0" strokeWidth={2} />
      </button>
      <button
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-soft px-xs py-1 text-button-sm text-ink transition-colors outline-none hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-pressed"
        type="button"
        aria-label="AI 지침 편집"
        aria-expanded={isPromptOpen}
        onClick={() => {
          setPromptOpenToken((token) => (token ?? 0) + 1);
          setIsPromptOpen(true);
        }}
      >
        <ScrollText className="size-3.5 shrink-0" strokeWidth={2} />
        <span>지침</span>
      </button>
      <ActionSheet
        isOpen={openSheet === "model"}
        items={toModelItems(agents, onSelectModel)}
        header={{ title: "모델 선택" }}
        anchorRef={modelAnchorRef}
        onClose={() => setOpenSheet(null)}
      />
      <ActionSheet
        isOpen={openSheet === "thinking"}
        items={toThinkingItems(onSelectThinking)}
        header={{ title: "생각 수준 선택" }}
        anchorRef={thinkingAnchorRef}
        onClose={() => setOpenSheet(null)}
      />
      <LlmSystemPromptSheet
        key={promptOpenToken}
        isOpen={isPromptOpen}
        initialPrompt={llmSystemPrompt}
        onClose={() => setIsPromptOpen(false)}
        onSaved={setLlmSystemPrompt}
      />
    </div>
  );

  function toModelItems(
    options: LlmAgentOption[],
    onSelect: (model: Nullable<string>) => void,
  ): ActionSheetItem[] {
    return [
      { label: "자동 (우선순위)", onSelect: () => onSelect(null) },
      ...options.map((option) => ({
        label: `${toLlmProviderBranding(option.provider).label} · ${option.model}`,
        onSelect: () => onSelect(option.model),
      })),
    ];
  }

  function toThinkingItems(
    onSelect: (thinking: Nullable<LlmThinkingLevel>) => void,
  ): ActionSheetItem[] {
    return [
      { label: "생각: 기본", onSelect: () => onSelect(null) },
      { label: "생각: 낮음", onSelect: () => onSelect("low") },
      { label: "생각: 높음", onSelect: () => onSelect("high") },
    ];
  }
}
