import type { VocaCardState } from "@/entities/voca";
import { cn } from "@/shared/lib";

export type VocaStatusBadgeProps = {
  className?: string;
  labelClassName?: string;
  state: VocaCardState | string;
  suspended?: boolean;
  isDue?: boolean;
};

export function VocaStatusBadge({
  className,
  labelClassName,
  state,
  suspended = false,
  isDue = false,
}: VocaStatusBadgeProps) {
  let label = "새 단어";
  let colorClasses = "bg-primary-tint text-primary border-primary/25";

  if (suspended) {
    label = "보류됨";
    colorClasses = "bg-surface-soft text-meta border-hairline";
  } else if (isDue || state === "review") {
    label = "복습";
    colorClasses = "bg-semantic-success/10 text-semantic-success border-semantic-success/25";
  } else if (state === "learning" || state === "relearning") {
    label = "학습 중";
    colorClasses = "bg-semantic-warning/10 text-semantic-warning border-semantic-warning/25";
  } else if (state === "new") {
    label = "새 단어";
    colorClasses = "bg-primary-tint text-primary border-primary/25";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-medium transition-colors select-none",
        colorClasses,
        className,
      )}
    >
      <span className={cn("leading-none", labelClassName)}>{label}</span>
    </span>
  );
}
