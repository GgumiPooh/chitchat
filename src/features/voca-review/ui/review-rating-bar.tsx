"use client";

import type { VocaCard } from "@/entities/voca";
import { cn } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";
import { computeAllNextIntervals, Rating } from "../model/fsrs";

export type ReviewRatingBarProps = {
  className?: string;
  card: VocaCard;
  desiredRetention?: number;
  disabled?: boolean;
  onRate: (rating: Rating) => void;
};

export function ReviewRatingBar({
  className,
  card,
  desiredRetention = 0.9,
  disabled = false,
  onRate,
}: ReviewRatingBarProps) {
  const intervals = computeAllNextIntervals(card, desiredRetention);

  const buttons = [
    {
      rating: Rating.Again,
      label: "다시",
      interval: intervals[Rating.Again]?.intervalString ?? "< 10분",
      shortcut: "1",
      containerClass:
        "border-semantic-error/30 bg-semantic-error/10 hover:bg-semantic-error/20 text-semantic-error",
    },
    {
      rating: Rating.Hard,
      label: "어려움",
      interval: intervals[Rating.Hard]?.intervalString ?? "1일",
      shortcut: "2",
      containerClass:
        "border-semantic-warning/30 bg-semantic-warning/10 hover:bg-semantic-warning/20 text-semantic-warning",
    },
    {
      rating: Rating.Good,
      label: "알맞음",
      interval: intervals[Rating.Good]?.intervalString ?? "3일",
      shortcut: "3",
      containerClass: "border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary",
    },
    {
      rating: Rating.Easy,
      label: "쉬움",
      interval: intervals[Rating.Easy]?.intervalString ?? "7일",
      shortcut: "4",
      containerClass:
        "border-semantic-success/30 bg-semantic-success/10 hover:bg-semantic-success/20 text-semantic-success",
    },
  ];

  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {buttons.map((btn) => (
        <HapticTarget key={btn.rating} className="flex w-full" isTicking={!disabled}>
          <button
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-xl border p-2.5 transition-all duration-150 active:scale-95",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-40",
              btn.containerClass,
            )}
            type="button"
            disabled={disabled}
            onClick={() => onRate(btn.rating)}
          >
            <span className="text-caption font-semibold">{btn.label}</span>
            <span className="text-caption text-xs opacity-80">{btn.interval}</span>
          </button>
        </HapticTarget>
      ))}
    </div>
  );
}
