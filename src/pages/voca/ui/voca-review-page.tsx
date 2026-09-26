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
import { Button, Container, IconButton } from "@/shared/ui";
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todayExtraNewCards: extraStudyCount + 5 }),
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
              variant="plain"
              haptic
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
                variant="plain"
                haptic
                disabled={isSubmitting}
                aria-label="이전 카드로 되돌리기 (Cmd+Z)"
                onClick={undo}
              />
            )}
          </div>
        </Container>
      </header>

      {/* Main Review Body */}
      <main className="flex-1 px-4 pt-4 pb-16 sm:pt-6 sm:pb-24">
        <Container className="flex flex-col gap-6" size="md">
          {isCompleted ? (
            <ReviewCompletionCard
              newCardsRemaining={0}
              onStudyMore={handleStudyMore}
              onReviewAhead={() => router.refresh()}
              onAddWord={() => router.push(VOCA_ROUTE)}
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

              {/* Bottom Action Area */}
              <div className="pt-2">
                {isFlipped ? (
                  <div className="space-y-3">
                    <ReviewRatingBar
                      card={currentCard}
                      desiredRetention={desiredRetention}
                      disabled={isSubmitting}
                      onRate={rate}
                    />
                    <p className="text-center text-caption text-meta">
                      단축키: 1 (다시) · 2 (어려움) · 3 (알맞음) · 4 (쉬움)
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      className="h-12 w-full text-button-md font-semibold"
                      variant="primary"
                      haptic
                      onClick={flip}
                    >
                      정답 확인하기 (Space)
                    </Button>
                    <p className="text-caption text-meta">카드를 탭하거나 스페이스바를 누르세요</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </Container>
      </main>
    </div>
  );
}
