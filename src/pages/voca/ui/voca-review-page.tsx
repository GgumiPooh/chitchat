"use client";

import type { VocaCard } from "@/entities/voca";
import {
  ReviewCardFrame,
  ReviewCompletionCard,
  ReviewRatingBar,
  useReviewSession,
} from "@/features/voca-review";
import { VOCA_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Container, IconButton } from "@/shared/ui";
import { Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type VocaReviewPageProps = {
  className?: string;
  initialDueCards: VocaCard[];
  desiredRetention?: number;
};

export function VocaReviewPage({
  className,
  initialDueCards,
  desiredRetention = 0.9,
}: VocaReviewPageProps) {
  const router = useRouter();
  const [extraStudyCount, setExtraStudyCount] = useState(0);

  const {
    queue,
    currentCard,
    isFlipped,
    isSubmitting,
    isCompleted,
    canUndo,
    progress,
    flip,
    rate,
    undo,
  } = useReviewSession({
    initialCards: initialDueCards,
    desiredRetention,
  });

  const handleStudyMore = async () => {
    try {
      const res = await fetch("/api/voca/settings", {
        body: JSON.stringify({ todayExtraNewCards: extraStudyCount + 5 }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (res.ok) {
        setExtraStudyCount((prev) => prev + 5);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={cn("flex min-h-dvh flex-col bg-canvas", className)}>
      {/* Immersive Top Bar */}
      <header className="bg-surface/80 sticky top-0 z-20 h-14 border-b border-hairline/60 backdrop-blur-md">
        <Container className="grid h-full grid-cols-[1fr_auto_1fr] items-center" size="md">
          <div className="flex items-center justify-self-start">
            <IconButton
              Icon={X}
              haptic
              variant="plain"
              aria-label="복습 종료"
              onClick={() => router.push(VOCA_ROUTE)}
            />
          </div>

          <div className="flex items-center justify-center text-body-sm font-semibold text-ink">
            <span>
              {isCompleted ? queue.length : progress.current} / {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-1 justify-self-end">
            {canUndo && (
              <IconButton
                Icon={Undo2}
                disabled={isSubmitting}
                haptic
                variant="plain"
                aria-label="이전 카드로 되돌리기 (Cmd+Z)"
                onClick={undo}
              />
            )}
          </div>
        </Container>
      </header>

      {/* Main Review Body */}
      <main
        className={cn("flex-1 px-4 pt-4 sm:pt-6", isFlipped ? "pb-36 sm:pb-40" : "pb-16 sm:pb-24")}
      >
        <Container className="flex flex-col gap-6" size="md">
          {isCompleted ? (
            <ReviewCompletionCard
              newCardsRemaining={0}
              onAddWord={() => router.push(VOCA_ROUTE)}
              onReviewAhead={() => router.refresh()}
              onStudyMore={handleStudyMore}
            />
          ) : currentCard ? (
            <div className="space-y-6">
              <ReviewCardFrame
                card={currentCard}
                isFlipped={isFlipped}
                onFlip={flip}
                onRate={rate}
                onUndo={undo}
              />
            </div>
          ) : null}
        </Container>
      </main>

      {/* Fixed Bottom Rating Bar above TabBar */}
      {!isCompleted && isFlipped && currentCard && (
        <div className="pointer-events-none fixed right-0 bottom-[calc(var(--bottom-inset)+12px)] left-(--rail-width) z-20 animate-in duration-200 fade-in slide-in-from-bottom-2">
          <Container className="pointer-events-auto px-4" size="md">
            <div className="bg-surface/95 rounded-2xl border border-hairline/80 p-2 shadow-floating backdrop-blur-md">
              <ReviewRatingBar
                card={currentCard}
                desiredRetention={desiredRetention}
                disabled={isSubmitting}
                onRate={rate}
              />
            </div>
          </Container>
        </div>
      )}
    </div>
  );
}
