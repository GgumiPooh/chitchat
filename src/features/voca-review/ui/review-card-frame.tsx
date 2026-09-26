"use client";

import type { VocaCard } from "@/entities/voca";
import { cn, isCommandKey } from "@/shared/lib";
import { useEffect } from "react";
import { Rating } from "../model/fsrs";
import { CardFace } from "./card-face";

export type ReviewCardFrameProps = {
  className?: string;
  card: VocaCard;
  isFlipped: boolean;
  onFlip: () => void;
  onRate?: (rating: Rating) => void;
  onUndo?: () => void;
};

function cleanSentenceForSpeech(sentence: string, targetWord: string): string {
  return sentence
    .replace(/<\/?b>/gi, "")
    .replace(/_{3,}/g, targetWord)
    .trim();
}

export function ReviewCardFrame({
  className,
  card,
  isFlipped,
  onFlip,
  onRate,
  onUndo,
}: ReviewCardFrameProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      // Undo: Cmd+Z / Ctrl+Z
      if (isCommandKey(e) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Space to flip
      if (e.code === "Space") {
        e.preventDefault();
        onFlip();
        return;
      }

      // R to replay audio
      if (e.key.toLowerCase() === "r" && !isCommandKey(e)) {
        e.preventDefault();
        const audioUrl = isFlipped ? (card.audioUrl ?? card.sentenceAudioUrl) : card.audioUrl;
        const textToSpeak = isFlipped
          ? card.targetWord
          : cleanSentenceForSpeech(card.sentence, card.targetWord);

        if (audioUrl) {
          const audio = new Audio(audioUrl);
          audio.play().catch(() => {});
        } else if (textToSpeak && typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.lang = "en-US";
          window.speechSynthesis.speak(utterance);
        }
        return;
      }

      // 1, 2, 3, 4 to rate when back is showing
      if (isFlipped && onRate) {
        if (e.key === "1") {
          e.preventDefault();
          onRate(Rating.Again);
        } else if (e.key === "2") {
          e.preventDefault();
          onRate(Rating.Hard);
        } else if (e.key === "3") {
          e.preventDefault();
          onRate(Rating.Good);
        } else if (e.key === "4") {
          e.preventDefault();
          onRate(Rating.Easy);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [card, isFlipped, onFlip, onRate, onUndo]);

  return (
    <div
      className={cn("w-full select-none", className)}
      onClick={() => {
        if (!isFlipped) {
          onFlip();
        }
      }}
    >
      <div
        key={isFlipped ? `${card.id}-back` : `${card.id}-front`}
        className={cn("w-full animate-in duration-200 fade-in", !isFlipped && "cursor-pointer")}
      >
        <CardFace card={card} side={isFlipped ? "back" : "front"} autoplayAudio={isFlipped} />
      </div>
    </div>
  );
}
