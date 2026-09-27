"use client";

import type { VocaCard } from "@/entities/voca";
import {
  ReviewCardFrame,
  ReviewCompletionCard,
  ReviewRatingBar,
  VocaStudyCounts,
  useReviewSession,
} from "@/features/voca-review";
import { VOCA_ACTION_ADD, VOCA_ACTION_PARAM, VOCA_CARDS_ROUTE, VOCA_ROUTE } from "@/shared/config";
import { cn, warmSpeechVoices } from "@/shared/lib";
import { Button, Container, IconButton } from "@/shared/ui";
import { ChevronLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type VocaReviewPageProps = {
  className?: string;
  initialDueCards: VocaCard[];
  desiredRetention?: number;
  newCardsRemaining?: number;
};

export function VocaReviewPage({
  className,
  initialDueCards,
  desiredRetention = 0.9,
  newCardsRemaining = 0,
}: VocaReviewPageProps) {
  const router = useRouter();
  const [extraStudyCount, setExtraStudyCount] = useState(0);
  const hasNotifiedCompletionRef = useRef(false);

  const {
    queue,
    currentIndex,
    currentCard,
    isFlipped,
    isSubmitting,
    isCompleted,
    counts,
    canGoBack,
    progress,
    flip,
    rate,
    goBack,
  } = useReviewSession({
    initialCards: initialDueCards,
    desiredRetention,
  });

  const handleFlip = () => {
    warmSpeechVoices();
    flip();
  };

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

  useEffect(() => {
    if (!isCompleted || initialDueCards.length === 0) {
      return;
    }
    if (hasNotifiedCompletionRef.current) {
      return;
    }
    hasNotifiedCompletionRef.current = true;

    void fetch("/api/voca/complete", {
      body: JSON.stringify({ count: initialDueCards.length }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }).catch((err) => {
      console.error("Failed to notify voca completion:", err);
    });
  }, [initialDueCards.length, isCompleted]);

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
            <span>
              {isCompleted ? queue.length : progress.current} / {queue.length}
            </span>
          </div>

          <div className="flex items-center gap-1 justify-self-end">
            <IconButton
              Icon={X}
              haptic
              variant="plain"
              aria-label="학습 종료"
              onClick={() => router.push(VOCA_ROUTE)}
            />
          </div>
        </Container>
      </header>

      {/* Main Review Body */}
      <main className="flex-1 pt-4 pb-36 sm:pt-6 sm:pb-40">
        <Container className="flex flex-col gap-6" size="md">
          {isCompleted ? (
            <ReviewCompletionCard
              newCardsRemaining={newCardsRemaining}
              onAddWord={() => router.push(`${VOCA_ROUTE}?${VOCA_ACTION_PARAM}=${VOCA_ACTION_ADD}`)}
              onBrowseCards={() => router.push(VOCA_CARDS_ROUTE)}
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
      {!isCompleted && currentCard && (
        <div className="pointer-events-none fixed right-0 bottom-[calc(var(--bar-lift)+12px)] left-(--rail-width) z-20 animate-in duration-200 fade-in slide-in-from-bottom-2">
          <Container className="pointer-events-auto px-4" size="md">
            <div className="flex flex-col gap-2 rounded-2xl border border-hairline bg-canvas/95 p-2.5 shadow-floating backdrop-blur-md">
              <VocaStudyCounts
                learningCount={counts.learningCount}
                newCount={counts.newCount}
                reviewCount={counts.reviewCount}
              />

              {!isFlipped ? (
                <Button
                  className="w-full"
                  buttonClassName="rounded-xl h-14 bg-surface-soft text-ink hover:bg-surface-strong border border-hairline text-body-sm font-semibold"
                  haptic
                  onClick={handleFlip}
                >
                  <span>정답 보기</span>
                  <span className="text-caption font-normal text-meta">(Space)</span>
                </Button>
              ) : (
                <ReviewRatingBar
                  card={currentCard}
                  desiredRetention={desiredRetention}
                  disabled={isSubmitting}
                  onRate={rate}
                />
              )}
            </div>
          </Container>
        </div>
      )}
    </div>
  );
}
