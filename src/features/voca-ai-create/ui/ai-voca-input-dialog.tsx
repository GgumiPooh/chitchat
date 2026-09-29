"use client";

import { BottomSheet, Button } from "@/shared/ui";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type AiVocaInputDialogProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
};

export function AiVocaInputDialog({ className, isOpen, onClose }: AiVocaInputDialogProps) {
  const [inputText, setInputText] = useState("");
  const [contextSentence, setContextSentence] = useState("");

  const handleSubmit = () => {
    const rawTokens = inputText
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (rawTokens.length === 0) {
      toast.error("추가할 단어를 1개 이상 입력해주세요.");
      return;
    }

    // Immediate optimistic closure (non-blocking, instant response)
    onClose();
    setInputText("");
    setContextSentence("");
    toast.success(`${rawTokens.length}개 단어 생성을 시작했어요. 생성이 끝나면 알림을 보내드려요.`);

    const trimmedContext = contextSentence.trim();

    // Fire individual independent background generation requests
    for (const word of rawTokens) {
      void fetch("/api/voca/ai-generate", {
        body: JSON.stringify({
          contextSentence: trimmedContext || undefined,
          word,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }).catch((err) => {
        console.error(`[ai-voca] Generation request failed for word: ${word}`, err);
      });
    }
  };

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        className: "-mb-1.5",
        title: "✨ AI 단어 추가",
      }}
      onClose={onClose}
    >
      <div className="space-y-3 pb-2">
        {/* Description placed inside scrollable body so it scrolls together */}
        <p className="text-center text-body-sm whitespace-pre-line text-meta">
          추가하고 싶은 영어 단어를 입력하면 AI가 맞춤형 예문과 발음을 생성해요.
        </p>

        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-ink">
            단어 입력 (쉼표 또는 줄바꿈으로 여러 개 입력 가능)
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-hairline bg-surface-soft p-3 text-body-sm text-ink placeholder:text-meta-soft focus:border-primary focus:outline-none"
            placeholder="예: deliberate, ephemeral, ubiquitous"
            rows={3}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-caption font-semibold text-ink">
            참고 문맥 / 발견한 문장 (선택 사항)
          </label>
          <textarea
            className="w-full resize-none rounded-xl border border-hairline bg-surface-soft p-3 text-body-sm text-ink placeholder:text-meta-soft focus:border-primary focus:outline-none"
            placeholder="단어가 쓰였던 원문 문장을 적어주시면 더 정확한 예문이 만들어져요."
            rows={2}
            value={contextSentence}
            onChange={(e) => setContextSentence(e.target.value)}
          />
          <p className="text-caption text-meta">
            여러 단어 입력 시 문장에 포함된 단어에만 문맥이 적용돼요.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button
            className="flex-1 gap-1.5"
            disabled={!inputText.trim()}
            haptic
            variant="primary"
            onClick={handleSubmit}
          >
            <Sparkles className="h-4 w-4" />
            생성 시작
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
