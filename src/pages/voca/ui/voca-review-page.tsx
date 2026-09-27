"use client";

import type { VocaCard } from "@/entities/voca";
import {
  ReviewCardFrame,
  ReviewCompletionCard,
  ReviewRatingBar,
  useReviewSession,
} from "@/features/voca-review";
import { VOCA_ACTION_ADD, VOCA_ACTION_PARAM, VOCA_REVIEW_ROUTE, VOCA_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Container, IconButton } from "@/shared/ui";
import { ChevronLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type VocaReviewPageProps = {
  className?: string;
  initialDueCards: VocaCard[];
  desiredRetention?: number;
  isPractice?: boolean;
  newCardsRemaining?: number;
  canReviewAhead?: boolean;
};

export function VocaReviewPage({
  className,
  initialDueCards,
  desiredRetention = 0.9,
  isPractice = false,
  newCardsRemaining = 0,
  canReviewAhead = true,
}: VocaReviewPageProps) {
  const router = useRouter();
  const [extraStudyCount, setExtraStudyCount] = useState(0);

  const {
    queue,
    currentIndex,
    currentCard,
    isFlipped,
    isSubmitting,
    isCompleted,
    canGoBack,
    progress,
    flip,
    rate,
    goBack,
    restart,
  } = useReviewSession({
    initialCards: initialDueCards,
    desiredRetention,
    isSimulation: isPractice,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const rafId = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });

    return () => cancelAnimationFrame(rafId);
  }, [currentIndex, isFlipped, isCompleted]);

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
      <header className="sticky top-0 z-20 h-14 border-b border-hairline bg-canvas/80 backdrop-blur-md">
        <Container className="grid h-full grid-cols-[1fr_auto_1fr] items-center" size="md">
          <div className="flex items-center justify-self-start">
            <IconButton
              Icon={ChevronLeft}
              disabled={!canGoBack || isSubmitting}
              haptic
              variant="plain"
              aria-label="이전으로 가기"
              onClick={goBack}
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-body-sm font-semibold text-ink">
            {isPractice && (
              <span className="rounded-full bg-semantic-warning/15 px-2 py-0.5 text-caption font-medium text-semantic-warning">
                연습 모드
              </span>
            )}
            <span>
              {isCompleted ? queue.length : progress.current} / {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-1 justify-self-end">
            <IconButton
              Icon={X}
              haptic
              variant="plain"
              aria-label="복습 종료"
              onClick={() => router.push(VOCA_ROUTE)}
            />
          </div>
        </Container>
      </header>

      {/* Main Review Body */}
      <main className={cn("flex-1 pt-4 sm:pt-6", isFlipped ? "pb-36 sm:pb-40" : "pb-16 sm:pb-24")}>
        <Container className="flex flex-col gap-6" size="md">
          {isCompleted ? (
            <ReviewCompletionCard
              canReviewAhead={canReviewAhead}
              isPractice={isPractice}
              newCardsRemaining={newCardsRemaining}
              onReviewAhead={() => {
                if (canReviewAhead) {
                  router.push(`${VOCA_REVIEW_ROUTE}?mode=ahead`);
                } else {
                  toast.info("미리 복습할 수 있는 단어가 없어요. 새로운 단어를 추가해보세요!");
                }
              }}
              onAddWord={() => router.push(`${VOCA_ROUTE}?${VOCA_ACTION_PARAM}=${VOCA_ACTION_ADD}`)}
              onRestartPractice={isPractice ? restart : undefined}
              onStudyMore={handleStudyMore}
            />
          ) : currentCard ? (
            <div className="space-y-6">
              <ReviewCardFrame
                card={currentCard}
                isFlipped={isFlipped}
                onFlip={flip}
                onRate={rate}
                onUndo={goBack}
              />
            </div>
          ) : null}
        </Container>
      </main>

      {/* INFO: 하단 탭바가 숨겨지므로 바닥 안전 여백(--bar-lift) 위에 바로 배치한다. */}
      {!isCompleted && isFlipped && currentCard && (
        <div className="pointer-events-none fixed right-0 bottom-[calc(var(--bar-lift)+12px)] left-(--rail-width) z-20 animate-in duration-200 fade-in slide-in-from-bottom-2">
          <Container className="pointer-events-auto px-4" size="md">
            <div className="rounded-2xl border border-hairline bg-canvas p-2 shadow-floating">
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
