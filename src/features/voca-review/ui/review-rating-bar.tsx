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
      textColor: "text-semantic-error",
      hoverClass: "hover:bg-semantic-error/10 hover:border-semantic-error/40",
      activeClass: "active:bg-semantic-error/20",
    },
    {
      rating: Rating.Hard,
      label: "어려움",
      interval: intervals[Rating.Hard]?.intervalString ?? "1일",
      shortcut: "2",
      textColor: "text-semantic-warning",
      hoverClass: "hover:bg-semantic-warning/10 hover:border-semantic-warning/40",
      activeClass: "active:bg-semantic-warning/20",
    },
    {
      rating: Rating.Good,
      label: "보통",
      interval: intervals[Rating.Good]?.intervalString ?? "3일",
      shortcut: "3",
      textColor: "text-primary",
      hoverClass: "hover:bg-primary/10 hover:border-primary/40",
      activeClass: "active:bg-primary/20",
    },
    {
      rating: Rating.Easy,
      label: "쉬움",
      interval: intervals[Rating.Easy]?.intervalString ?? "7일",
      shortcut: "4",
      textColor: "text-semantic-success",
      hoverClass: "hover:bg-semantic-success/10 hover:border-semantic-success/40",
      activeClass: "active:bg-semantic-success/20",
    },
  ];

  return (
    <div className={cn("grid grid-cols-4 gap-2 sm:gap-3", className)}>
      {buttons.map((btn) => (
        <HapticTarget key={btn.rating} className="flex w-full" isTicking={!disabled} keepsScroll>
          <button
            className={cn(
              "flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-hairline bg-surface-soft p-2 shadow-xs transition-all duration-150",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none",
              "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
              btn.hoverClass,
              btn.activeClass,
            )}
            type="button"
            disabled={disabled}
            onClick={() => onRate(btn.rating)}
          >
            <span className={cn("text-body-sm leading-tight font-bold", btn.textColor)}>
              {btn.label}
            </span>
            <span className="mt-0.5 text-caption leading-tight font-medium text-meta">
              {btn.interval}
            </span>
          </button>
        </HapticTarget>
      ))}
    </div>
  );
}
