"use client";

import type { VocaCard } from "@/entities/voca";
import {
  A_SECOND,
  cleanSentenceForSpeech,
  cn,
  isValidAudioUrl,
  speakVocaText,
  stopVocaSpeech,
  type VocaCardId,
} from "@/shared/lib";
import { Button, Modal, VocaAudioButton } from "@/shared/ui";
import { josa } from "es-hangul";
import { Ban, Check, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export type VocaInlineEditorProps = {
  className?: string;
  card: VocaCard;
  onSave: (updated: VocaCard) => void;
  onDelete: (id: VocaCardId) => void;
};

type VocaCardDraft = {
  targetWord: string;
  pos: string;
  pronunciation: string;
  koreanMeaning: string;
  englishDefinition: string;
  sentence: string;
  confusable: string;
  collocations: string;
  wordFamily: string;
  examples: string;
  tags: string;
  suspended: boolean;
};

const AUTO_SAVE_DEBOUNCE = A_SECOND / 2;

function serializeCardDraft(draft: VocaCardDraft): string {
  return JSON.stringify({
    targetWord: draft.targetWord,
    pos: draft.pos,
    pronunciation: draft.pronunciation,
    koreanMeaning: draft.koreanMeaning,
    englishDefinition: draft.englishDefinition,
    sentence: draft.sentence,
    confusable: draft.confusable.trim() || null,
    collocations: draft.collocations,
    wordFamily: draft.wordFamily.trim() || null,
    examples: draft.examples
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    tags: draft.tags.trim() || null,
    suspended: draft.suspended,
  });
}

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

  const [isDeleting, setIsDeleting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const [activeTrack, setActiveTrack] = useState<"word" | "sentence" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isMountedRef = useRef(true);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const isInitialMount = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentDraft: VocaCardDraft = useMemo(
    () => ({
      targetWord,
      pos,
      pronunciation,
      koreanMeaning,
      englishDefinition,
      sentence,
      confusable,
      collocations,
      wordFamily,
      examples,
      tags,
      suspended,
    }),
    [
      targetWord,
      pos,
      pronunciation,
      koreanMeaning,
      englishDefinition,
      sentence,
      confusable,
      collocations,
      wordFamily,
      examples,
      tags,
      suspended,
    ],
  );

  const currentDraftRef = useRef(currentDraft);

  const lastSavedPayloadRef = useRef<string>(
    serializeCardDraft({
      targetWord: card.targetWord,
      pos: card.pos,
      pronunciation: card.pronunciation,
      koreanMeaning: card.koreanMeaning,
      englishDefinition: card.englishDefinition,
      sentence: card.sentence,
      confusable: card.confusable ?? "",
      collocations: card.collocations,
      wordFamily: card.wordFamily ?? "",
      examples: card.examples.join("\n"),
      tags: card.tags ?? "",
      suspended: card.suspended,
    }),
  );

  const performSave = useCallback(async () => {
    const draft = currentDraftRef.current;
    const payloadString = serializeCardDraft(draft);

    if (payloadString === lastSavedPayloadRef.current) {
      return;
    }

    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;
    pendingSaveRef.current = false;
    if (isMountedRef.current) {
      setSaveStatus("saving");
    }

    try {
      const parsedExamples = draft.examples
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const res = await fetch(`/api/voca/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetWord: draft.targetWord,
          pos: draft.pos,
          pronunciation: draft.pronunciation,
          koreanMeaning: draft.koreanMeaning,
          englishDefinition: draft.englishDefinition,
          sentence: draft.sentence,
          confusable: draft.confusable.trim() || null,
          collocations: draft.collocations,
          wordFamily: draft.wordFamily.trim() || null,
          examples: parsedExamples,
          tags: draft.tags.trim() || null,
          suspended: draft.suspended,
        }),
      });

      if (!res.ok) {
        throw new Error("Save failed");
      }

      const data = await res.json();
      lastSavedPayloadRef.current = payloadString;
      if (isMountedRef.current) {
        setSaveStatus("saved");
        if (saveStatusTimerRef.current) {
          clearTimeout(saveStatusTimerRef.current);
        }
        saveStatusTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
          }
        }, 1500);
      }
      onSave(data.card);
    } catch (err) {
      console.error(err);
      if (isMountedRef.current) {
        setSaveStatus("error");
      }
      toast.error("변경사항을 저장하지 못했어요.");
    } finally {
      isSavingRef.current = false;
      const latestPayload = serializeCardDraft(currentDraftRef.current);
      if (pendingSaveRef.current || latestPayload !== lastSavedPayloadRef.current) {
        pendingSaveRef.current = false;
        void performSave();
      }
    }
  }, [card.id, onSave]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (saveStatusTimerRef.current) {
        clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }
      if (serializeCardDraft(currentDraftRef.current) !== lastSavedPayloadRef.current) {
        void performSave();
      }
    };
  }, [performSave]);

  useEffect(() => {
    currentDraftRef.current = currentDraft;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (serializeCardDraft(currentDraft) === lastSavedPayloadRef.current) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void performSave();
    }, AUTO_SAVE_DEBOUNCE);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentDraft, performSave]);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplay = null;
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
    stopVocaSpeech();
    setActiveTrack(null);
  }, []);

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  const playTrack = useCallback(
    (track: "word" | "sentence") => {
      stopAllAudio();
      setActiveTrack(track);

      const isWord = track === "word";
      const isWordUnchanged = targetWord.trim() === card.targetWord.trim();
      const isSentenceUnchanged = sentence.trim() === card.sentence.trim();

      const rawAudioUrl = isWord
        ? isWordUnchanged
          ? card.audioUrl
          : null
        : isSentenceUnchanged && isWordUnchanged
          ? card.sentenceAudioUrl
          : null;

      const fallbackText = isWord
        ? targetWord.trim()
        : cleanSentenceForSpeech(sentence, targetWord);

      const triggerSpeech = () => {
        if (!fallbackText) {
          setActiveTrack(null);
          return;
        }

        speakVocaText(fallbackText, {
          onStart: () => {
            setActiveTrack(track);
          },
          onEnd: () => {
            setActiveTrack(null);
          },
          onError: () => {
            setActiveTrack(null);
          },
        });
      };

      if (isValidAudioUrl(rawAudioUrl)) {
        if (!audioRef.current && typeof Audio !== "undefined") {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        if (audio) {
          audio.src = rawAudioUrl!;
          audio.onplay = () => {
            setActiveTrack(track);
          };
          audio.onended = () => {
            setActiveTrack(null);
          };
          audio.onerror = () => {
            triggerSpeech();
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              triggerSpeech();
            });
          }
          return;
        }
      }

      triggerSpeech();
    },
    [
      card.audioUrl,
      card.sentenceAudioUrl,
      card.sentence,
      card.targetWord,
      sentence,
      stopAllAudio,
      targetWord,
    ],
  );

  const handleToggleWord = () => {
    if (activeTrack === "word") {
      stopAllAudio();
    } else {
      playTrack("word");
    }
  };

  const handleToggleSentence = () => {
    if (activeTrack === "sentence") {
      stopAllAudio();
    } else {
      playTrack("sentence");
    }
  };

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleConfirmDelete = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    lastSavedPayloadRef.current = serializeCardDraft(currentDraftRef.current);

    stopAllAudio();
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/voca/cards/${card.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      toast.success("단어 카드를 삭제했어요.");
      setIsDeleteDialogOpen(false);
      onDelete(card.id);
    } catch (err) {
      console.error(err);
      toast.error("삭제에 실패했어요.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn("flex flex-col space-y-4 p-4 pb-6", className)}>
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-title-sm font-bold text-ink">단어 카드 편집</h3>
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-caption text-meta">
              <RotateCw className="h-3 w-3 animate-spin text-primary" />
              저장 중...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-caption text-meta-soft">
              <Check className="h-3 w-3 text-semantic-success" />
              저장됨
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-caption text-semantic-warning">저장 실패</span>
          )}
        </div>
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
            aria-label="단어 카드 삭제"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex h-7 items-center justify-between">
            <label className="text-caption font-semibold text-meta">단어</label>
            <VocaAudioButton
              isPlaying={activeTrack === "word"}
              label={`${targetWord || "단어"} 발음 듣기`}
              size="sm"
              textToSpeak={targetWord.trim()}
              audioUrl={targetWord.trim() === card.targetWord.trim() ? card.audioUrl : null}
              onTogglePlay={handleToggleWord}
            />
          </div>
          <input
            className="w-full rounded-lg border border-hairline bg-surface-soft p-2 text-body-sm text-ink focus:border-primary focus:outline-none"
            value={targetWord}
            onChange={(e) => setTargetWord(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <div className="flex h-7 items-center">
            <label className="text-caption font-semibold text-meta">품사</label>
          </div>
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
        <div className="flex h-7 items-center justify-between">
          <label className="text-caption font-semibold text-meta">
            빈칸 문맥 문장 (빈칸: &lt;b&gt;__________&lt;/b&gt;)
          </label>
          <VocaAudioButton
            isPlaying={activeTrack === "sentence"}
            label="예문 전체 듣기"
            size="sm"
            textToSpeak={cleanSentenceForSpeech(sentence, targetWord)}
            audioUrl={
              sentence.trim() === card.sentence.trim() &&
              targetWord.trim() === card.targetWord.trim()
                ? card.sentenceAudioUrl
                : null
            }
            onTogglePlay={handleToggleSentence}
          />
        </div>
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

      <Modal
        isOpen={isDeleteDialogOpen}
        size="sm"
        header={{
          title: `${josa(card.targetWord, "을/를")} 삭제할까요?`,
          description: "삭제한 단어 카드는 다시 복구할 수 없어요.",
        }}
        onClose={() => setIsDeleteDialogOpen(false)}
      >
        <div className="flex gap-xs">
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => setIsDeleteDialogOpen(false)}
          >
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isDeleting}
            haptic
            onClick={() => void handleConfirmDelete()}
          >
            삭제
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export function VocaInlineEditor(props: VocaInlineEditorProps) {
  return <VocaInlineEditorForm key={props.card.id} {...props} />;
}
