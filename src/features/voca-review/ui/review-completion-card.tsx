"use client";

import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { BookOpen, CheckCircle2, PlusCircle, Sparkles } from "lucide-react";

export type ReviewCompletionCardProps = {
  className?: string;
  newCardsRemaining?: number;
  onStudyMore?: () => void;
  onAddWord?: () => void;
  onBrowseCards?: () => void;
};

export function ReviewCompletionCard({
  className,
  newCardsRemaining = 0,
  onStudyMore,
  onAddWord,
  onBrowseCards,
}: ReviewCompletionCardProps) {
  const hasMoreNew = newCardsRemaining > 0;

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

      <h3 className="mt-5 text-title-md font-bold text-ink">오늘의 학습 완료! 🎉</h3>
      <p className="mt-2 text-body-sm text-meta">
        {hasMoreNew
          ? `오늘 할당된 학습을 모두 끝냈어요. 미학습 단어가 ${newCardsRemaining}장 더 있어요.`
          : "오늘 학습할 단어를 모두 마쳤어요! 훌륭해요."}
      </p>

      <div className="mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-2.5">
        {hasMoreNew && onStudyMore && (
          <Button className="w-full" haptic variant="primary" onClick={onStudyMore}>
            <PlusCircle className="h-4 w-4" />
            +5장 더 배우기
          </Button>
        )}
        {onAddWord && (
          <Button
            className="w-full"
            haptic
            variant={hasMoreNew ? "secondary" : "primary"}
            onClick={onAddWord}
          >
            <Sparkles className="h-4 w-4" />
            AI로 새 단어 추가하기
          </Button>
        )}
        {onBrowseCards && (
          <Button className="w-full" haptic variant="secondary" onClick={onBrowseCards}>
            <BookOpen className="h-4 w-4" />
            단어장 보러가기
          </Button>
        )}
      </div>
    </div>
  );
}
