"use client";

import type { VocaCard, VocaCardState } from "@/entities/voca";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Rating } from "./fsrs";

export type UseReviewSessionOptions = {
  initialCards: VocaCard[];
  desiredRetention?: number;
  isSimulation?: boolean;
};

export type UndoEntry = {
  card: VocaCard;
  queueSnapshot: VocaCard[];
  index: number;
};

export type ReviewSessionCounts = {
  newCount: number;
  learningCount: number;
  reviewCount: number;
};

export function useReviewSession({ initialCards, isSimulation = false }: UseReviewSessionOptions) {
  const [queue, setQueue] = useState<VocaCard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [cardStartTime, setCardStartTime] = useState<number>(() => Date.now());

  const currentCard = queue[currentIndex] ?? null;
  const isCompleted = queue.length === 0 || currentIndex >= queue.length;
  const remainingCards = queue.slice(currentIndex);

  const counts: ReviewSessionCounts = useMemo(() => {
    let newCount = 0;
    let learningCount = 0;
    let reviewCount = 0;

    for (const card of remainingCards) {
      if (card.state === "new") {
        newCount += 1;
      } else if (card.state === "learning" || card.state === "relearning") {
        learningCount += 1;
      } else if (card.state === "review") {
        reviewCount += 1;
      } else {
        newCount += 1;
      }
    }

    return { newCount, learningCount, reviewCount };
  }, [remainingCards]);

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
          const nextState: VocaCardState = currentCard.state === "new" ? "learning" : "relearning";
          setQueue((prev) => [...prev, { ...currentCard, state: nextState }]);
        }

        // Call server review API only when not in simulation mode
        if (!isSimulation) {
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
            console.warn("[reviewSession] Server sync failed, response status:", response.status);
          }
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
    [currentCard, isSubmitting, cardStartTime, queue, currentIndex, isSimulation],
  );

  const undo = useCallback(async () => {
    if (undoStack.length === 0 || isSubmitting) {
      return;
    }

    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setIsSubmitting(true);

    try {
      if (!isSimulation) {
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
  }, [undoStack, isSubmitting, isSimulation]);

  const restart = useCallback(() => {
    setQueue(initialCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsSubmitting(false);
    setUndoStack([]);
    setCardStartTime(Date.now());
  }, [initialCards]);

  const unflip = useCallback(() => {
    setIsFlipped(false);
  }, []);

  const goBack = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    if (isFlipped) {
      setIsFlipped(false);
      return;
    }
    if (undoStack.length > 0) {
      void undo();
    }
  }, [isFlipped, isSubmitting, undoStack.length, undo]);

  return {
    queue,
    currentIndex,
    currentCard,
    isFlipped,
    isSubmitting,
    isCompleted,
    counts,
    canUndo: undoStack.length > 0,
    canGoBack: isFlipped || undoStack.length > 0,
    progress: {
      current: Math.min(currentIndex + 1, queue.length),
      total: queue.length,
    },
    flip,
    unflip,
    goBack,
    rate,
    undo,
    restart,
  };
}
