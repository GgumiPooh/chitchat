"use client";

import { cn } from "@/shared/lib";
import { Search } from "lucide-react";
import type { VocaRecommendGrade, VocaRecommendTag } from "../model/types";

const TAGS: VocaRecommendTag[] = [
  "전체",
  "토익",
  "수능",
  "공무원",
  "비즈니스",
  "일상 회화",
  "IT/개발",
];

const GRADES: {
  activeClass: string;
  dotColor: string;
  label: string;
  id: VocaRecommendGrade;
}[] = [
  {
    activeClass:
      "border-semantic-success/40 bg-semantic-success/15 font-bold text-semantic-success shadow-xs",
    dotColor: "bg-semantic-success",
    id: "essential",
    label: "기초/필수",
  },
  {
    activeClass:
      "border-semantic-warning/40 bg-semantic-warning/15 font-bold text-semantic-warning shadow-xs",
    dotColor: "bg-semantic-warning",
    id: "core",
    label: "실전/최빈출",
  },
  {
    activeClass:
      "border-semantic-error/40 bg-semantic-error/15 font-bold text-semantic-error shadow-xs",
    dotColor: "bg-semantic-error",
    id: "killer",
    label: "고득점/심화",
  },
];

export type VocaRecommendFilterBarProps = {
  className?: string;
  customTopic: string;
  disabled?: boolean;
  isCustomInputOpen: boolean;
  selectedGrade: VocaRecommendGrade;
  selectedTag: VocaRecommendTag;
  onCustomTopicChange: (topic: string) => void;
  onCustomTopicSubmit: () => void;
  onSelectGrade: (grade: VocaRecommendGrade) => void;
  onSelectTag: (tag: VocaRecommendTag) => void;
  onToggleCustomInput: () => void;
};

export function VocaRecommendFilterBar({
  className,
  customTopic,
  disabled = false,
  isCustomInputOpen,
  selectedGrade,
  selectedTag,
  onCustomTopicChange,
  onCustomTopicSubmit,
  onSelectGrade,
  onSelectTag,
  onToggleCustomInput,
}: VocaRecommendFilterBarProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Category Tag Pills (Horizontal Scroll) */}
      <div className="scrollbar-hidden flex items-center gap-1.5 overflow-x-auto pb-1">
        {TAGS.map((t) => {
          const isSelected = selectedTag === t && !isCustomInputOpen;
          return (
            <button
              key={t}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors select-none",
                isSelected
                  ? "bg-primary text-on-primary"
                  : "border border-hairline bg-surface-soft text-meta hover:text-ink",
                disabled && "cursor-not-allowed opacity-50",
              )}
              disabled={disabled}
              type="button"
              onClick={() => {
                if (isCustomInputOpen) {
                  onToggleCustomInput();
                }
                onSelectTag(t);
              }}
            >
              {t}
            </button>
          );
        })}

        <button
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-caption font-semibold transition-colors select-none",
            isCustomInputOpen
              ? "bg-primary text-on-primary"
              : "border border-hairline bg-surface-soft text-meta hover:text-ink",
            disabled && "cursor-not-allowed opacity-50",
          )}
          disabled={disabled}
          type="button"
          onClick={onToggleCustomInput}
        >
          + 직접 입력
        </button>
      </div>

      {/* Custom Topic Input if toggled */}
      {isCustomInputOpen && (
        <div className="flex gap-2 pt-0.5">
          <div className="relative flex-1">
            <input
              className="w-full rounded-xl border border-hairline bg-surface-soft py-2 pr-9 pl-3 text-body-sm text-ink placeholder:text-meta-soft focus:border-primary focus:outline-none"
              disabled={disabled}
              placeholder="예: 공항 입국심사, 스타트업 IR, 환경 보호"
              type="text"
              value={customTopic}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onCustomTopicSubmit();
                }
              }}
              onChange={(e) => onCustomTopicChange(e.target.value)}
            />
            <button
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-meta hover:text-ink disabled:opacity-40"
              disabled={disabled || !customTopic.trim()}
              type="button"
              onClick={onCustomTopicSubmit}
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Frequency Grade Segmented Bar */}
      <div className="flex rounded-full border border-hairline bg-surface-soft p-1" role="group">
        {GRADES.map((g) => {
          const isSelected = selectedGrade === g.id;
          return (
            <button
              key={g.id}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-caption transition-all select-none",
                isSelected
                  ? cn("border font-bold", g.activeClass)
                  : "border border-transparent bg-transparent font-medium text-meta hover:text-ink active:bg-surface-pressed",
                disabled && "cursor-not-allowed opacity-50",
              )}
              disabled={disabled}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectGrade(g.id)}
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full transition-all",
                  g.dotColor,
                  isSelected && "ring-2 ring-current/30",
                )}
              />
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
