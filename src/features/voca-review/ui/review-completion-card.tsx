"use client";

import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { CheckCircle2, PlusCircle, RotateCw, Sparkles } from "lucide-react";

export type ReviewCompletionCardProps = {
  className?: string;
  newCardsRemaining?: number;
  isPractice?: boolean;
  canReviewAhead?: boolean;
  onStudyMore?: () => void;
  onReviewAhead?: () => void;
  onAddWord?: () => void;
  onRestartPractice?: () => void;
};

export function ReviewCompletionCard({
  className,
  newCardsRemaining = 0,
  isPractice = false,
  canReviewAhead = true,
  onStudyMore,
  onReviewAhead,
  onAddWord,
  onRestartPractice,
}: ReviewCompletionCardProps) {
  const hasMoreNew = newCardsRemaining > 0;

  if (isPractice) {
    return (
      <div
        className={cn(
          "bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-8 text-center shadow-sm",
          className,
        )}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-semantic-success/15 text-semantic-success">
          <CheckCircle2 className="h-9 w-9" />
        </div>

        <h3 className="mt-5 text-title-md font-bold text-ink">미리 복습 완료! 🎉</h3>
        <p className="mt-2 text-body-sm text-meta">
          미리 복습(연습)을 모두 마쳤어요. 원래 복습 일정에는 영향을 주지 않아요.
        </p>

        <div className="mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-2.5">
          {onRestartPractice && (
            <Button className="w-full" variant="secondary" haptic onClick={onRestartPractice}>
              <RotateCw className="h-4 w-4" />
              다시 연습하기
            </Button>
          )}
          {onAddWord && (
            <Button className="w-full" variant="primary" haptic onClick={onAddWord}>
              <Sparkles className="h-4 w-4" />
              AI로 새 단어 추가하기
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-8 text-center shadow-sm",
        className,
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-semantic-success/15 text-semantic-success">
        <CheckCircle2 className="h-9 w-9" />
      </div>

      <h3 className="mt-5 text-title-md font-bold text-ink">오늘의 복습 완료! 🎉</h3>
      <p className="mt-2 text-body-sm text-meta">
        {hasMoreNew
          ? `오늘 할당된 복습을 모두 끝냈어요. 미학습 단어가 ${newCardsRemaining}장 더 있어요.`
          : "오늘 복습할 단어를 모두 마쳤어요! 훌륭해요."}
      </p>

      <div className="mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-2.5">
        {hasMoreNew ? (
          <Button className="w-full" variant="primary" haptic onClick={onStudyMore}>
            <PlusCircle className="h-4 w-4" />
            +5장 더 배우기
          </Button>
        ) : (
          <>
            {onReviewAhead && (
              <Button
                className="w-full"
                disabled={!canReviewAhead}
                variant="secondary"
                haptic
                onClick={onReviewAhead}
              >
                미리 복습하기
              </Button>
            )}
            {onAddWord && (
              <Button className="w-full" variant="primary" haptic onClick={onAddWord}>
                <Sparkles className="h-4 w-4" />
                AI로 새 단어 추가하기
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
