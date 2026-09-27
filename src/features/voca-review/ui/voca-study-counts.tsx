import { cn, type Nullable, type VocaCardState } from "@/shared/lib";

export type VocaStudyCountsProps = {
  className?: string;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  activeState?: Nullable<VocaCardState | string>;
};

export function VocaStudyCounts({
  className,
  newCount,
  learningCount,
  reviewCount,
  activeState,
}: VocaStudyCountsProps) {
  const isNewActive = activeState === "new";
  const isLearningActive = activeState === "learning" || activeState === "relearning";
  const isReviewActive = activeState === "review";

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 py-0.5 text-caption font-semibold select-none",
        className,
      )}
      aria-label={`새 카드 ${newCount}개, 학습 중 카드 ${learningCount}개, 복습 카드 ${reviewCount}개`}
    >
      <span
        className={cn(
          "font-mono text-body-sm font-bold text-event-blue tabular-nums",
          isNewActive && "underline decoration-2 underline-offset-4",
        )}
        title="새 단어"
      >
        {newCount}
      </span>
      <span className="text-caption font-normal text-meta-soft">+</span>
      <span
        className={cn(
          "font-mono text-body-sm font-bold text-semantic-error tabular-nums",
          isLearningActive && "underline decoration-2 underline-offset-4",
        )}
        title="학습 중"
      >
        {learningCount}
      </span>
      <span className="text-caption font-normal text-meta-soft">+</span>
      <span
        className={cn(
          "font-mono text-body-sm font-bold text-semantic-success tabular-nums",
          isReviewActive && "underline decoration-2 underline-offset-4",
        )}
        title="복습"
      >
        {reviewCount}
      </span>
    </div>
  );
}
