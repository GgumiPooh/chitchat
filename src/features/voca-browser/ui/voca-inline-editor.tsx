"use client";

import type { VocaCard } from "@/entities/voca";
import { cn, type VocaCardId } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { Ban, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type VocaInlineEditorProps = {
  className?: string;
  card: VocaCard;
  onSave: (updated: VocaCard) => void;
  onDelete: (id: VocaCardId) => void;
};

function VocaInlineEditorForm({ className, card, onSave, onDelete }: VocaInlineEditorProps) {
  const [targetWord, setTargetWord] = useState(card.targetWord);
  const [pos, setPos] = useState(card.pos);
  const [pronunciation, setPronunciation] = useState(card.pronunciation);
  const [koreanMeaning, setKoreanMeaning] = useState(card.koreanMeaning);
  const [englishDefinition, setEnglishDefinition] = useState(card.englishDefinition);
  const [sentence, setSentence] = useState(card.sentence);
  const [confusable, setConfusable] = useState(card.confusable ?? "");
  const [collocations, setCollocations] = useState(card.collocations);
  const [wordFamily, setWordFamily] = useState(card.wordFamily ?? "");
  const [examples, setExamples] = useState(card.examples.join("\n"));
  const [tags, setTags] = useState(card.tags ?? "");
  const [suspended, setSuspended] = useState(card.suspended);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsedExamples = examples
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch(`/api/voca/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWord,
          pos,
          pronunciation,
          koreanMeaning,
          englishDefinition,
          sentence,
          confusable: confusable.trim() || null,
          collocations,
          wordFamily: wordFamily.trim() || null,
          examples: parsedExamples,
          tags: tags.trim() || null,
          suspended,
        }),
      });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      const data = await res.json();
      toast.success("카드를 저장했어요.");
      onSave(data.card);
    } catch (err) {
      console.error(err);
      toast.error("저장에 실패했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 이 단어 카드를 삭제할까요?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/voca/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      toast.success("단어 카드를 삭제했어요.");
      onDelete(card.id);
    } catch (err) {
      console.error(err);
      toast.error("삭제에 실패했어요.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn("flex flex-col space-y-4 p-4", className)}>
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <h3 className="text-title-sm font-bold text-ink">단어 카드 편집</h3>
        <div className="flex items-center gap-2">
          <Button
            className={cn(
              "min-h-9 w-auto px-3 py-1 text-button-sm",
              suspended && "text-semantic-warning",
            )}
            variant={suspended ? "secondary" : "ghost"}
            onClick={() => setSuspended((prev) => !prev)}
          >
            <Ban className="mr-1 h-3.5 w-3.5" />
            {suspended ? "보류 해제" : "학습 보류"}
          </Button>
          <Button
            className="min-h-9 w-auto px-3 py-1 text-button-sm"
            disabled={isDeleting}
            variant="destructive"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">단어</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={targetWord}
            onChange={(e) => setTargetWord(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">품사</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={pos}
            onChange={(e) => setPos(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">발음 기호</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 font-mono text-body-sm text-ink focus:border-primary focus:outline-none"
            value={pronunciation}
            onChange={(e) => setPronunciation(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">한국어 의미</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={koreanMeaning}
            onChange={(e) => setKoreanMeaning(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-caption font-semibold text-meta">영어 정의</label>
        <textarea
          className="w-full resize-none rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
          rows={2}
          value={englishDefinition}
          onChange={(e) => setEnglishDefinition(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-caption font-semibold text-meta">
          빈칸 문맥 문장 (빈칸: &lt;b&gt;__________&lt;/b&gt;)
        </label>
        <textarea
          className="w-full resize-none rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
          rows={2}
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-caption font-semibold text-meta">연어 (Collocations)</label>
        <input
          className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
          value={collocations}
          onChange={(e) => setCollocations(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">혼동 어휘</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={confusable}
            onChange={(e) => setConfusable(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-caption font-semibold text-meta">어휘 계열</label>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={wordFamily}
            onChange={(e) => setWordFamily(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-caption font-semibold text-meta">추가 예문 (줄바꿈 구분)</label>
        <textarea
          className="w-full resize-none rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
          rows={3}
          value={examples}
          onChange={(e) => setExamples(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <label className="text-caption font-semibold text-meta">태그</label>
        <input
          className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      <div className="pt-2">
        <Button
          className="w-full gap-1.5"
          disabled={isSaving}
          haptic
          variant="primary"
          onClick={handleSave}
        >
          <Check className="h-4 w-4" />
          변경사항 저장
        </Button>
      </div>
    </div>
  );
}

export function VocaInlineEditor(props: VocaInlineEditorProps) {
  return <VocaInlineEditorForm key={props.card.id} {...props} />;
}
