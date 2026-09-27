"use client";

import { cn } from "@/shared/lib";
import { BottomSheet, Button, EmptyState } from "@/shared/ui";
import { BookOpen, Compass, RotateCw, Sparkles } from "lucide-react";
import { useVocaRecommendation } from "../model/use-voca-recommendation";
import { VocaRecommendFilterBar } from "./voca-recommend-filter-bar";
import { VocaRecommendItemRow } from "./voca-recommend-item-row";

export type VocaRecommendSheetProps = {
  className?: string;
  isOpen: boolean;
  onCardCreated?: () => void;
  onClose: () => void;
};

export function VocaRecommendSheet({
  className,
  isOpen,
  onCardCreated,
  onClose,
}: VocaRecommendSheetProps) {
  const {
    customTopic,
    fetchRecommendations,
    generateCard,
    generationStatuses,
    grade,
    handleCustomTopicChange,
    handleCustomTopicSubmit,
    handleSelectGrade,
    handleSelectTag,
    handleToggleCustomInput,
    hasCreatedAny,
    hasFetched,
    isCustomInputOpen,
    isFilterChanged,
    isGeneratingAny,
    isLoading,
    items,
    tag,
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
      header={{
        className: "-mb-1.5",
        title: "✨ AI 맞춤 단어 추천",
      }}
      onClose={handleClose}
    >
      <div className="space-y-3 pb-6">
        <p className="text-center text-body-sm whitespace-pre-line text-meta">
          시험 및 난이도별로 엄선된 새로운 단어를 추천해드려요.
        </p>

        {/* Filters */}
        <VocaRecommendFilterBar
          customTopic={customTopic}
          disabled={isLoading || isGeneratingAny}
          isCustomInputOpen={isCustomInputOpen}
          selectedGrade={grade}
          selectedTag={tag}
          onCustomTopicChange={handleCustomTopicChange}
          onCustomTopicSubmit={handleCustomTopicSubmit}
          onSelectGrade={handleSelectGrade}
          onSelectTag={handleSelectTag}
          onToggleCustomInput={handleToggleCustomInput}
        />

        {/* Content Area */}
        <div className="min-h-[260px] space-y-2">
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
          ) : !hasFetched ? (
            /* Initial State: Waiting for user to configure and trigger recommendation */
            <div className="bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-primary">
                <Compass className="h-7 w-7" />
              </div>
              <h4 className="mt-4 text-title-sm font-bold text-ink">
                {tag === "전체" ? "맞춤 영단어 추천" : `${tag} 단어 추천`}
              </h4>
              <p className="mt-1.5 max-w-[280px] text-body-sm text-meta">
                위에서 목표와 빈출 난이도를 선택한 후 아래 버튼을 누르면 AI가 엄선한 단어들을
                가져옵니다.
              </p>
              <Button
                className="mt-6 w-full max-w-[280px] gap-2"
                haptic
                variant="primary"
                onClick={() => void fetchRecommendations()}
              >
                <Sparkles className="h-4 w-4" />
                단어 추천받기
              </Button>
            </div>
          ) : items.length > 0 ? (
            /* Items List */
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

        {/* Bottom Actions (Shown once recommendations have been loaded) */}
        {hasFetched && (
          <div className="space-y-2 pt-2">
            <Button
              className="w-full gap-2"
              disabled={isLoading || isGeneratingAny}
              haptic
              variant={isFilterChanged ? "primary" : "secondary"}
              onClick={() => void fetchRecommendations()}
            >
              {isFilterChanged ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  선택한 조건으로 새로 추천받기
                </>
              ) : (
                <>
                  <RotateCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                  다른 단어 다시 추천받기
                </>
              )}
            </Button>

            {isGeneratingAny && (
              <p className="text-center text-caption text-meta">
                단어를 생성하고 있어요. 잠시만 기다려주세요...
              </p>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
