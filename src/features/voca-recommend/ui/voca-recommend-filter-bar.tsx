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

const GRADES: { label: string; dotColor: string; id: VocaRecommendGrade }[] = [
  { id: "essential", label: "기초/필수", dotColor: "bg-semantic-success" },
  { id: "core", label: "실전/최빈출", dotColor: "bg-semantic-warning" },
  { id: "killer", label: "고득점/심화", dotColor: "bg-semantic-danger" },
];

export type VocaRecommendFilterBarProps = {
  className?: string;
  selectedTag: VocaRecommendTag;
  selectedGrade: VocaRecommendGrade;
  customTopic: string;
  isCustomInputOpen: boolean;
  disabled?: boolean;
  onSelectTag: (tag: VocaRecommendTag) => void;
  onSelectGrade: (grade: VocaRecommendGrade) => void;
  onCustomTopicChange: (topic: string) => void;
  onCustomTopicSubmit: () => void;
  onToggleCustomInput: () => void;
};

export function VocaRecommendFilterBar({
  className,
  selectedTag,
  selectedGrade,
  customTopic,
  isCustomInputOpen,
  disabled = false,
  onSelectTag,
  onSelectGrade,
  onCustomTopicChange,
  onCustomTopicSubmit,
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
              type="button"
              disabled={disabled}
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
          type="button"
          disabled={disabled}
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
              type="text"
              placeholder="예: 공항 입국심사, 스타트업 IR, 환경 보호"
              value={customTopic}
              disabled={disabled}
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
              type="button"
              disabled={disabled || !customTopic.trim()}
              onClick={onCustomTopicSubmit}
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Frequency Grade Segmented Bar */}
      <div className="flex rounded-xl border border-hairline bg-surface-soft p-1">
        {GRADES.map((g) => {
          const isSelected = selectedGrade === g.id;
          return (
            <button
              key={g.id}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-caption font-medium transition-all select-none",
                isSelected ? "bg-surface text-ink shadow-xs" : "text-meta hover:text-ink",
                disabled && "cursor-not-allowed opacity-50",
              )}
              type="button"
              disabled={disabled}
              onClick={() => onSelectGrade(g.id)}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", g.dotColor)} />
              <span>{g.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
