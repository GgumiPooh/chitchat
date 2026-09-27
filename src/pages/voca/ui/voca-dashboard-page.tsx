"use client";

import type { VocaDueSummary, VocaHeatmapDay, VocaUserSettings } from "@/entities/voca";
import { AiVocaInputDialog } from "@/features/voca-ai-create";
import { calculateVocaStreak, VocaHeatmap } from "@/features/voca-heatmap";
import { VocaRecommendSheet } from "@/features/voca-recommend";
import {
  PLAYGROUND_ROUTE,
  VOCA_CARDS_ROUTE,
  VOCA_REVIEW_ROUTE,
  VOCA_SETTINGS_ROUTE,
} from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Button, Container, IconButton } from "@/shared/ui";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Compass,
  Flame,
  GraduationCap,
  RotateCw,
  Settings,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type VocaDashboardPageProps = {
  className?: string;
  initialDueSummary: VocaDueSummary;
  initialHeatmap: VocaHeatmapDay[];
  initialSettings: VocaUserSettings;
  totalCardsCount?: number;
};

export function VocaDashboardPage({
  className,
  initialDueSummary,
  initialHeatmap,
  totalCardsCount = 0,
}: VocaDashboardPageProps) {
  const router = useRouter();
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isRecommendOpen, setIsRecommendOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dueSummary = initialDueSummary;
  const heatmap = initialHeatmap;

  const { streak, todayCount: studiedToday } = useMemo(
    () => calculateVocaStreak(heatmap),
    [heatmap],
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const hasDueCards = dueSummary.totalDue > 0;

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="영단어"
        trailingFadesOnScroll
        leading={
          <IconButton
            Icon={ChevronLeft}
            haptic
            variant="floating"
            aria-label="놀이터로 돌아가기"
            onClick={() => router.push(PLAYGROUND_ROUTE)}
          />
        }
        trailing={
          <div className="flex items-center gap-xs">
            <IconButton
              Icon={BookOpen}
              haptic
              variant="floating"
              aria-label="단어장 보기"
              onClick={() => router.push(VOCA_CARDS_ROUTE)}
            />
            <IconButton
              Icon={Settings}
              haptic
              variant="floating"
              aria-label="영단어 설정"
              onClick={() => router.push(VOCA_SETTINGS_ROUTE)}
            />
            <IconButton
              iconClassName={isRefreshing ? "animate-spin" : undefined}
              Icon={RotateCw}
              disabled={isRefreshing}
              haptic
              variant="floating"
              aria-label="새로고침"
              onClick={handleRefresh}
            />
          </div>
        }
      />

      <Container
        className="space-y-lg py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl"
        size="md"
      >
        {/* Hero Review Status Card */}
        <div className="bg-surface relative overflow-hidden rounded-3xl border border-hairline p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold tracking-wider text-meta uppercase">
                <GraduationCap className="h-4 w-4 text-primary" />
                오늘의 플래시카드 복습
              </span>
              <h2 className="text-display-sm font-bold text-ink">
                {hasDueCards ? (
                  <>
                    오늘 복습할 단어 <span className="text-primary">{dueSummary.totalDue}</span>개
                  </>
                ) : (
                  <>오늘 복습 완료! 🎉</>
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-caption text-meta">
                <span className="rounded-full bg-primary-tint px-2.5 py-0.5 font-medium text-primary">
                  새 단어 {dueSummary.newCount}
                </span>
                <span className="rounded-full bg-semantic-warning/15 px-2.5 py-0.5 font-medium text-semantic-warning">
                  학습 중 {dueSummary.learningCount}
                </span>
                <span className="rounded-full bg-semantic-success/15 px-2.5 py-0.5 font-medium text-semantic-success">
                  복습 {dueSummary.reviewCount}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1 sm:pt-0">
              {hasDueCards ? (
                <Button
                  className="flex-1 sm:w-auto"
                  buttonClassName="rounded-2xl"
                  variant="primary"
                  haptic
                  onClick={() => router.push(VOCA_REVIEW_ROUTE)}
                >
                  <BookOpen className="h-4 w-4" />
                  복습 시작하기
                </Button>
              ) : (
                <Button
                  className="flex-1 sm:w-auto"
                  buttonClassName="rounded-2xl"
                  variant="secondary"
                  haptic
                  onClick={() => router.push(VOCA_REVIEW_ROUTE)}
                >
                  <CheckCircle2 className="h-4 w-4 text-semantic-success" />
                  미리 복습하기
                </Button>
              )}

              <Button
                className="w-auto shrink-0"
                buttonClassName="rounded-2xl px-3.5 sm:px-4"
                variant="secondary"
                haptic
                onClick={() => setIsAiDialogOpen(true)}
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span>단어 추가</span>
              </Button>
            </div>
          </div>
        </div>

        {/* AI Vocabulary Recommendation Section */}
        <div className="bg-surface relative overflow-hidden rounded-3xl border border-hairline p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold tracking-wider text-meta uppercase">
                <Sparkles className="h-4 w-4 text-primary" />
                AI 맞춤 단어 탐색
              </span>
              <h3 className="text-title-md font-bold text-ink">나에게 꼭 필요한 영단어 추천</h3>
              <p className="text-body-sm text-meta">
                토익, 수능, 공무원 등 내 목표와 빈출 난이도에 맞는 새로운 단어를 발견해보세요.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-medium text-meta">
                  #토익
                </span>
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-medium text-meta">
                  #수능
                </span>
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-medium text-meta">
                  #공무원
                </span>
                <span className="rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-medium text-meta">
                  #비즈니스
                </span>
              </div>
            </div>

            <Button
              className="w-auto shrink-0 self-start sm:self-auto"
              buttonClassName="rounded-2xl px-5 gap-2"
              variant="primary"
              haptic
              onClick={() => setIsRecommendOpen(true)}
            >
              <Compass className="h-4 w-4" />
              단어 추천받기
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-4 text-center">
            <span className="text-caption text-meta">오늘 학습</span>
            <div className="mt-1 flex items-baseline gap-1 text-title-md font-bold text-ink">
              <Calendar className="h-4 w-4 text-primary" />
              <span>{studiedToday}</span>
              <span className="text-caption font-normal text-meta">개</span>
            </div>
          </div>

          <div className="bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-4 text-center">
            <span className="text-caption text-meta">전체 카드</span>
            <div className="mt-1 flex items-baseline gap-1 text-title-md font-bold text-ink">
              <BookOpen className="h-4 w-4 text-meta" />
              <span>{totalCardsCount}</span>
              <span className="text-caption font-normal text-meta">장</span>
            </div>
          </div>

          <div className="bg-surface flex flex-col items-center justify-center rounded-2xl border border-hairline p-4 text-center">
            <span className="text-caption text-meta">연속 학습</span>
            <div className="mt-1 flex items-baseline gap-1 text-title-md font-bold text-ink">
              <Flame className="h-4 w-4 text-semantic-warning" />
              <span>{streak}</span>
              <span className="text-caption font-normal text-meta">일</span>
            </div>
          </div>
        </div>

        {/* Heatmap Section */}
        <div className="space-y-2">
          <VocaHeatmap heatmap={heatmap} />
        </div>
      </Container>

      {/* AI Word Creation Dialog */}
      <AiVocaInputDialog isOpen={isAiDialogOpen} onClose={() => setIsAiDialogOpen(false)} />

      {/* AI Vocabulary Recommendation Sheet */}
      <VocaRecommendSheet
        isOpen={isRecommendOpen}
        onClose={() => setIsRecommendOpen(false)}
        onCardCreated={() => router.refresh()}
      />
    </div>
  );
}
