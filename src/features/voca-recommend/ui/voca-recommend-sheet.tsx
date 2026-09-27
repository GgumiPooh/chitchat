"use client";

import { cn } from "@/shared/lib";
import { BottomSheet, Button, EmptyState } from "@/shared/ui";
import { BookOpen, RotateCw } from "lucide-react";
import { useVocaRecommendation } from "../model/use-voca-recommendation";
import { VocaRecommendFilterBar } from "./voca-recommend-filter-bar";
import { VocaRecommendItemRow } from "./voca-recommend-item-row";

export type VocaRecommendSheetProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  onCardCreated?: () => void;
};

export function VocaRecommendSheet({
  className,
  isOpen,
  onClose,
  onCardCreated,
}: VocaRecommendSheetProps) {
  const {
    tag,
    grade,
    customTopic,
    isCustomInputOpen,
    items,
    isLoading,
    generationStatuses,
    isGeneratingAny,
    hasCreatedAny,
    setCustomTopic,
    setIsCustomInputOpen,
    handleSelectTag,
    handleSelectGrade,
    handleCustomTopicSubmit,
    fetchRecommendations,
    generateCard,
  } = useVocaRecommendation({
    isOpen,
    onCardCreated,
  });

  const handleClose = () => {
    onClose();
    if (hasCreatedAny) {
      onCardCreated?.();
    }
  };

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      isTall
      keepsHeightUnderKeyboard={isCustomInputOpen}
      header={{
        title: "✨ AI 맞춤 단어 추천",
        description: "시험 및 난이도별로 엄선된 새로운 단어를 추천해드려요.",
      }}
      onClose={handleClose}
    >
      <div className="space-y-4 pt-1 pb-6">
        {/* Filters */}
        <VocaRecommendFilterBar
          selectedTag={tag}
          selectedGrade={grade}
          customTopic={customTopic}
          isCustomInputOpen={isCustomInputOpen}
          disabled={isLoading || isGeneratingAny}
          onSelectTag={handleSelectTag}
          onSelectGrade={handleSelectGrade}
          onCustomTopicChange={setCustomTopic}
          onCustomTopicSubmit={handleCustomTopicSubmit}
          onToggleCustomInput={() => setIsCustomInputOpen((prev) => !prev)}
        />

        {/* Word Items List or Skeleton */}
        <div className="min-h-[280px] space-y-2">
          {isLoading ? (
            <div className="space-y-2 pt-1">
              {[1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="bg-surface flex items-center justify-between rounded-2xl border border-hairline p-4"
                >
                  <div className="space-y-2">
                    <div className="h-5 w-28 animate-pulse rounded-md bg-surface-soft" />
                    <div className="h-4 w-44 animate-pulse rounded-md bg-surface-soft" />
                  </div>
                  <div className="h-8 w-20 animate-pulse rounded-xl bg-surface-soft" />
                </div>
              ))}
            </div>
          ) : items.length > 0 ? (
            items.map((item) => {
              const status = generationStatuses[item.targetWord.toLowerCase()] ?? "idle";
              return (
                <VocaRecommendItemRow
                  key={item.targetWord}
                  item={item}
                  status={status}
                  onGenerate={generateCard}
                />
              );
            })
          ) : (
            <EmptyState
              Icon={BookOpen}
              description="추천할 새로운 단어가 없어요. 다른 주제나 등급을 선택해보세요."
            />
          )}
        </div>

        {/* Bottom Refresh Action */}
        <div className="space-y-2 pt-2">
          <Button
            className="w-full gap-2"
            variant="secondary"
            haptic
            disabled={isLoading || isGeneratingAny}
            onClick={() => fetchRecommendations()}
          >
            <RotateCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            다른 단어 다시 추천받기
          </Button>

          {isGeneratingAny && (
            <p className="text-center text-caption text-meta">
              단어를 생성하고 있어요. 잠시만 기다려주세요...
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
