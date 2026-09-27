import { cn } from "@/shared/lib";

export type VocaStudyCountsProps = {
  className?: string;
  newCount: number;
  learningCount: number;
  reviewCount: number;
};

export function VocaStudyCounts({
  className,
  newCount,
  learningCount,
  reviewCount,
}: VocaStudyCountsProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 py-0.5 text-caption font-semibold select-none",
        className,
      )}
      aria-label={`새 카드 ${newCount}개, 학습 중 카드 ${learningCount}개, 복습 카드 ${reviewCount}개`}
    >
      <span
        className="font-mono text-body-sm font-bold text-event-blue tabular-nums"
        title="새 단어"
      >
        {newCount}
      </span>
      <span className="text-caption font-normal text-meta-soft">+</span>
      <span
        className="font-mono text-body-sm font-bold text-semantic-error tabular-nums"
        title="학습 중"
      >
        {learningCount}
      </span>
      <span className="text-caption font-normal text-meta-soft">+</span>
      <span
        className="font-mono text-body-sm font-bold text-semantic-success tabular-nums"
        title="복습"
      >
        {reviewCount}
      </span>
    </div>
  );
}
