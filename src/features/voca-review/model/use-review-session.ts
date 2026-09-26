"use client";

import type { VocaCard } from "@/entities/voca";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Rating } from "./fsrs";

export type UseReviewSessionOptions = {
  initialCards: VocaCard[];
  desiredRetention?: number;
};

export type UndoEntry = {
  card: VocaCard;
  queueSnapshot: VocaCard[];
  index: number;
};

export function useReviewSession({ initialCards }: UseReviewSessionOptions) {
  const [queue, setQueue] = useState<VocaCard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [cardStartTime, setCardStartTime] = useState<number>(() => Date.now());

  const currentCard = queue[currentIndex] ?? null;
  const isCompleted = queue.length === 0 || currentIndex >= queue.length;

  const flip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!currentCard || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      const now = Date.now();
      const timeSpentMs = Math.max(0, now - cardStartTime);

      // Save for Undo
      setUndoStack((prev) => [
        ...prev,
        { card: currentCard, queueSnapshot: [...queue], index: currentIndex },
      ]);

      try {
        // If Again, push card to end of queue so learner sees it again this session
        if (rating === Rating.Again) {
          setQueue((prev) => [...prev, currentCard]);
        }

        // Call server review API
        const response = await fetch("/api/voca/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: currentCard.id,
            rating,
            timeSpentMs,
          }),
        });

        if (!response.ok) {
          // If offline or request fails, save to offline outbox if supported
          console.warn("[reviewSession] Server sync failed, response status:", response.status);
        }
      } catch (error) {
        console.warn("[reviewSession] Network error during review:", error);
      } finally {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        setIsSubmitting(false);
        setCardStartTime(Date.now());
      }
    },
    [currentCard, isSubmitting, cardStartTime, queue, currentIndex],
  );

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isSubmitting) {
      return;
    }

    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/voca/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: last.card.id }),
      });

      if (!response.ok) {
        toast.error("되돌리기를 완료하지 못했어요.");
      } else {
        toast.info("이전 카드로 되돌렸어요.");
      }
    } catch (error) {
      console.warn("[reviewSession] Undo failed:", error);
    } finally {
      setQueue(last.queueSnapshot);
      setCurrentIndex(last.index);
      setIsFlipped(false);
      setIsSubmitting(false);
      setCardStartTime(Date.now());
    }
  }, [undoStack, isSubmitting]);

  return {
    queue,
    currentIndex,
    currentCard,
    isFlipped,
    isSubmitting,
    isCompleted,
    canUndo: undoStack.length > 0,
    progress: {
      current: Math.min(currentIndex + 1, queue.length),
      total: queue.length,
    },
    flip,
    rate,
    undo,
  };
}
