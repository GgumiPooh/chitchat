"use client";

import type { VocaCard } from "@/entities/voca";
import { ReviewCardFrame, ReviewCompletionCard, ReviewRatingBar } from "@/features/voca-review";
import { cn } from "@/shared/lib";
import {
  useSnapshot,
  useSnapshotOwner,
  writeSnapshot,
  type VocaReviewOutboxEntry,
  type VocaSnapshot,
  type VocaSnapshotCard,
} from "@/shared/snapshot";
import { AppHeader, Container, IconButton } from "@/shared/ui";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MirrorLoading } from "./mirror-loading";

export type MirrorVocaProps = {
  className?: string;
  onBack?: () => void;
};

type MirrorVocaSessionProps = {
  className?: string;
  snapshot: VocaSnapshot;
  savedAt: number;
  onBack?: () => void;
};

function MirrorVocaSession({ className, snapshot, savedAt, onBack }: MirrorVocaSessionProps) {
  const ownerId = useSnapshotOwner();
  const outboxSnapshot = useSnapshot<VocaReviewOutboxEntry[]>("voca-outbox");

  const [queue] = useState<VocaCard[]>(() =>
    snapshot.dueCards.map((card: VocaSnapshotCard) => ({
      ...card,
      dueAt: card.dueAt ? new Date(card.dueAt) : null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      state: card.state as VocaCard["state"],
      examples: Array.isArray(card.examples) ? card.examples : [],
    })),
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentCard = queue[currentIndex] ?? null;
  const isCompleted = queue.length === 0 || currentIndex >= queue.length;

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

  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      const outboxEntry: VocaReviewOutboxEntry = {
        id: crypto.randomUUID(),
        cardId: currentCard.id,
        rating,
        timeSpentMs: 0,
        reviewedAt: new Date().toISOString(),
      };

      try {
        const existingOutbox =
          outboxSnapshot.status === "hit" && Array.isArray(outboxSnapshot.payload)
            ? outboxSnapshot.payload
            : [];
        const nextOutbox = [...existingOutbox, outboxEntry];
        if (ownerId) {
          await writeSnapshot(ownerId, "voca-outbox", nextOutbox);
        }

        toast.info("오프라인 복습을 저장했어요. 온라인 전환 시 자동 동기화돼요.");
      } catch (err) {
        console.error("[mirror-voca] Failed to write outbox snapshot:", err);
      } finally {
        setCurrentIndex((prev) => prev + 1);
        setIsFlipped(false);
        setIsSubmitting(false);
      }
    },
    [currentCard, isSubmitting, outboxSnapshot, ownerId],
  );

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="영단어 (오프라인)"
        leading={
          onBack ? (
            <IconButton
              Icon={ChevronLeft}
              variant="floating"
              haptic
              aria-label="뒤로가기"
              onClick={onBack}
            />
          ) : undefined
        }
      />

      <Container
        className="flex flex-1 flex-col justify-between py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl"
        size="md"
      >
        {isCompleted ? (
          <ReviewCompletionCard newCardsRemaining={0} onBrowseCards={onBack} />
        ) : currentCard ? (
          <div className="space-y-6">
            <div className="text-center text-body-sm font-semibold text-meta">
              {currentIndex + 1} / {queue.length}
            </div>

            <ReviewCardFrame
              card={currentCard}
              isFlipped={isFlipped}
              onFlip={() => setIsFlipped((prev) => !prev)}
            />

            {isFlipped ? (
              <div className="space-y-2 pt-2">
                <ReviewRatingBar
                  card={currentCard}
                  disabled={isSubmitting}
                  onRate={(r) => void handleRate(r)}
                />
              </div>
            ) : (
              <div className="text-center text-caption text-meta">
                카드를 탭하여 정답을 확인하세요
              </div>
            )}
          </div>
        ) : (
          <SnapshotEmpty Icon={GraduationCap} subject="복습할 단어" />
        )}

        <div className="mt-8 flex justify-center">
          <SnapshotStamp savedAt={savedAt} />
        </div>
      </Container>
    </div>
  );
}

export function MirrorVoca({ className, onBack }: MirrorVocaProps) {
  const vocaSnapshot = useSnapshot<VocaSnapshot>("voca");

  if (vocaSnapshot.status === "loading") {
    return <MirrorLoading variant="rows" />;
  }

  if (vocaSnapshot.status !== "hit") {
    return (
      <div className={cn("flex flex-1 flex-col", className)}>
        <AppHeader
          title="영단어"
          leading={
            onBack ? (
              <IconButton
                Icon={ChevronLeft}
                variant="floating"
                haptic
                aria-label="뒤로가기"
                onClick={onBack}
              />
            ) : undefined
          }
        />
        <Container
          className="flex flex-1 flex-col justify-center py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]"
          size="md"
        >
          <SnapshotEmpty Icon={GraduationCap} subject="영단어" />
        </Container>
      </div>
    );
  }

  return (
    <MirrorVocaSession
      className={className}
      snapshot={vocaSnapshot.payload}
      savedAt={vocaSnapshot.savedAt}
      onBack={onBack}
    />
  );
}
