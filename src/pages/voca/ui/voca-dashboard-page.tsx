"use client";

import type { VocaDueSummary, VocaHeatmapDay, VocaUserSettings } from "@/entities/voca";
import { AiVocaInputDialog } from "@/features/voca-ai-create";
import { VocaHeatmap } from "@/features/voca-heatmap";
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
  Flame,
  GraduationCap,
  Play,
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const dueSummary = initialDueSummary;
  const heatmap = initialHeatmap;

  // Calculate current streak from heatmap
  const streak = useMemo(() => {
    let currentStreak = 0;
    const sortedDays = [...heatmap].sort((a, b) => b.dayKey.localeCompare(a.dayKey));

    for (const day of sortedDays) {
      if (day.count > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
    return currentStreak;
  }, [heatmap]);

  const studiedToday = useMemo(() => {
    if (heatmap.length === 0) {
      return 0;
    }
    const sortedDays = [...heatmap].sort((a, b) => b.dayKey.localeCompare(a.dayKey));
    return sortedDays[0]?.count ?? 0;
  }, [heatmap]);

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
        leading={
          <IconButton
            Icon={ChevronLeft}
            variant="floating"
            haptic
            aria-label="놀이터로 돌아가기"
            onClick={() => router.push(PLAYGROUND_ROUTE)}
          />
        }
        trailing={
          <div className="flex items-center gap-xs">
            <IconButton
              Icon={BookOpen}
              variant="floating"
              haptic
              aria-label="단어장 보기"
              onClick={() => router.push(VOCA_CARDS_ROUTE)}
            />
            <IconButton
              Icon={Settings}
              variant="floating"
              haptic
              aria-label="영단어 설정"
              onClick={() => router.push(VOCA_SETTINGS_ROUTE)}
            />
            <IconButton
              iconClassName={isRefreshing ? "animate-spin" : undefined}
              Icon={RotateCw}
              variant="floating"
              haptic
              disabled={isRefreshing}
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

            <div className="flex flex-col gap-2 sm:flex-row">
              {hasDueCards ? (
                <Button
                  className="gap-2 px-6"
                  variant="primary"
                  haptic
                  onClick={() => router.push(VOCA_REVIEW_ROUTE)}
                >
                  <Play className="h-4 w-4 fill-current" />
                  복습 시작하기
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  variant="secondary"
                  haptic
                  onClick={() => router.push(VOCA_REVIEW_ROUTE)}
                >
                  <CheckCircle2 className="h-4 w-4 text-semantic-success" />
                  미리 복습하기
                </Button>
              )}

              <Button
                className="gap-1.5"
                variant="secondary"
                haptic
                onClick={() => setIsAiDialogOpen(true)}
              >
                <Sparkles className="h-4 w-4 text-primary" />
                AI 단어 추가
              </Button>
            </div>
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
    </div>
  );
}
