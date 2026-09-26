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

      // Check for undo shortcut: Cmd+Z / Ctrl+Z
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

      // R to replay audio (word pronunciation or sentence audio)
      if (e.key.toLowerCase() === "r" && !isCommandKey(e)) {
        e.preventDefault();
        const audioUrl = isFlipped ? (card.audioUrl ?? card.sentenceAudioUrl) : card.audioUrl;
        const textToSpeak = isFlipped
          ? card.targetWord
          : card.sentence.replace(/<b>.*?<\/b>/g, card.targetWord);

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
      className={cn("w-full cursor-pointer select-none", className)}
      style={{ perspective: "1000px" }}
      onClick={onFlip}
    >
      <div
        className="relative w-full transition-transform duration-500 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front Face */}
        <div
          className="w-full"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <CardFace card={card} side="front" />
        </div>

        {/* Back Face */}
        <div
          className="absolute inset-0 w-full"
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardFace card={card} side="back" autoplayAudio={isFlipped} />
        </div>
      </div>
    </div>
  );
}
