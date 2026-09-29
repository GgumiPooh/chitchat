"use client";

import type { VocaCard } from "@/entities/voca";
import { cn, isCommandKey, warmSpeechVoices } from "@/shared/lib";
import { useCallback, useEffect } from "react";
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
  const handleFlip = useCallback(() => {
    warmSpeechVoices();
    onFlip();
  }, [onFlip]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      // INFO: REQUIREMENTS.md § 17.4. Cmd+Z / Ctrl+Z to undo last rating.
      if (isCommandKey(e) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // INFO: REQUIREMENTS.md § 17.4. Space or Enter flips on front, rates Good on back (Anki convention).
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (isFlipped) {
          onRate?.(Rating.Good);
        } else {
          handleFlip();
        }
        return;
      }

      // INFO: REQUIREMENTS.md § 17.4. 1, 2, 3, 4 to rate when back is showing.
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
  }, [card, isFlipped, handleFlip, onRate, onUndo]);

  return (
    <div className={cn("w-full select-none", className)}>
      <div
        key={isFlipped ? `${card.id}-back` : `${card.id}-front`}
        className="w-full animate-in duration-200 fade-in"
      >
        <CardFace card={card} side={isFlipped ? "back" : "front"} autoplayAudio={isFlipped} />
      </div>
    </div>
  );
}
