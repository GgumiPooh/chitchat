"use client";

import type { VocaCard } from "@/entities/voca";
import { AiVocaInputDialog } from "@/features/voca-ai-create";
import {
  useVocaCards,
  VocaBatchActions,
  VocaCardRoster,
  VocaInlineEditor,
} from "@/features/voca-browser";
import { VocaRecommendSheet } from "@/features/voca-recommend";
import { SIDE_PANEL_MEDIA_QUERY, VOCA_ROUTE } from "@/shared/config";
import { cn, useSidePanel, type Nullable, type VocaCardId } from "@/shared/lib";
import {
  AppHeader,
  BottomSheet,
  Container,
  EmptyState,
  IconButton,
  LoadMoreSentinel,
  TwoPane,
} from "@/shared/ui";
import {
  BookOpen,
  CheckSquare,
  ChevronLeft,
  Compass,
  RotateCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type VocaCardsPageProps = {
  className?: string;
  initialCards: VocaCard[];
  initialNextCursor?: Nullable<VocaCardId>;
  initialHasMore?: boolean;
};

const STATUS_TABS = [
  { id: "all", label: "전체" },
  { id: "learning", label: "학습 중" },
  { id: "review", label: "복습 대기" },
  { id: "new", label: "미학습" },
  { id: "suspended", label: "정지됨" },
];

export function VocaCardsPage({
  className,
  initialCards,
  initialNextCursor,
  initialHasMore,
}: VocaCardsPageProps) {
  const router = useRouter();
  const { isOpen: isSidePanelOpen, open: openSidePanel } = useSidePanel();
  const desktopScrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const [selectedCard, setSelectedCard] = useState<Nullable<VocaCard>>(
    () => initialCards[0] ?? null,
  );
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isRecommendOpen, setIsRecommendOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<VocaCardId>>(new Set());

  const handleBack = useCallback(() => {
    // INFO: 데스크톱(lg)에서 사이드패널이 닫혀있는 상태라면, 카드 목록을 먼저 열고 이미 열려 있을 때 영단어 홈으로 이동한다.
    if (
      typeof window !== "undefined" &&
      window.matchMedia(SIDE_PANEL_MEDIA_QUERY).matches &&
      !isSidePanelOpen
    ) {
      openSidePanel();
      return;
    }
    router.push(VOCA_ROUTE);
  }, [isSidePanelOpen, openSidePanel, router]);

  const {
    cards,
    isLoading,
    hasMore,
    search,
    stateFilter,
    setSearch,
    setStateFilter,
    loadMore,
    refresh,
    updateCardLocally,
    removeCardLocally,
  } = useVocaCards({
    initialCards,
    initialNextCursor,
    initialHasMore,
  });

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsMobileSheetOpen(false);
      }
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const handleSelectDesktopCard = (card: VocaCard) => {
    setSelectedCard(card);
  };

  const handleOpenMobileCard = (card: VocaCard) => {
    setSelectedCard(card);
    setIsMobileSheetOpen(true);
  };

  const handleToggleSelectId = (id: VocaCardId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSaveCard = (updated: VocaCard) => {
    updateCardLocally(updated);
    if (selectedCard?.id === updated.id) {
      setSelectedCard(updated);
    }
  };

  const handleDeleteCard = (id: VocaCardId) => {
    removeCardLocally(id);
    if (selectedCard?.id === id) {
      setSelectedCard(null);
      setIsMobileSheetOpen(false);
    }
  };

  const handleBatchSuspend = async (suspend: boolean) => {
    for (const id of selectedIds) {
      try {
        await fetch(`/api/voca/cards/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suspended: suspend }),
        });
      } catch (err) {
        console.error(err);
      }
    }
    toast.success(suspend ? "선택한 카드를 보류했어요." : "선택한 카드의 보류를 해제했어요.");
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    void refresh();
  };

  const handleBatchDelete = async () => {
    if (!confirm(`선택한 ${selectedIds.size}장의 카드를 삭제할까요?`)) {
      return;
    }
    for (const id of selectedIds) {
      try {
        await fetch(`/api/voca/cards/${id}`, { method: "DELETE" });
      } catch (err) {
        console.error(err);
      }
    }
    toast.success("선택한 카드를 삭제했어요.");
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    void refresh();
  };

  const rosterHeaderAndControls = (
    <div className="space-y-3 p-0 lg:p-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-meta" />
        <input
          className="w-full rounded-xl border border-hairline bg-surface-soft py-2.5 pr-4 pl-9 text-body-sm text-ink placeholder:text-meta-soft focus:border-primary focus:outline-none"
          type="text"
          placeholder="단어, 뜻, 문장, 태그 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter Tabs */}
      <div className="scrollbar-hidden flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-caption font-medium transition-colors select-none",
              stateFilter === tab.id
                ? "bg-primary text-on-primary"
                : "border border-hairline bg-surface-soft text-meta hover:text-ink",
            )}
            type="button"
            onClick={() => setStateFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      {/* Responsive layout with TwoPane on desktop */}
      <TwoPane
        className="flex-1"
        panel={
          <div className="flex h-full flex-col">
            {rosterHeaderAndControls}
            <div ref={desktopScrollerRef} className="flex-1 overflow-y-auto">
              <VocaCardRoster
                cards={cards}
                selectedCardId={selectedCard?.id}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                onSelectCard={handleSelectDesktopCard}
                onToggleSelect={handleToggleSelectId}
              />
              {hasMore && <LoadMoreSentinel rootRef={desktopScrollerRef} onVisible={loadMore} />}
              {isLoading && (
                <div className="flex justify-center p-4">
                  <RotateCw className="h-4 w-4 animate-spin text-meta" />
                </div>
              )}
            </div>
          </div>
        }
      >
        <AppHeader
          hasSidePanel
          title="단어장"
          trailingFadesOnScroll
          leading={
            <IconButton
              Icon={ChevronLeft}
              haptic
              variant="floating"
              aria-label="뒤로"
              onClick={handleBack}
            />
          }
          trailing={
            <div className="flex items-center gap-xs">
              <IconButton
                className={cn(isSelectionMode && "border-primary text-primary")}
                Icon={CheckSquare}
                haptic
                variant="floating"
                aria-label="선택 모드"
                onClick={() => {
                  setIsSelectionMode((prev) => !prev);
                  setSelectedIds(new Set());
                }}
              />
              <IconButton
                Icon={Compass}
                haptic
                variant="floating"
                aria-label="AI 단어 추천"
                onClick={() => setIsRecommendOpen(true)}
              />
              <IconButton
                Icon={Sparkles}
                haptic
                variant="floating"
                aria-label="AI로 단어 추가"
                onClick={() => setIsAiDialogOpen(true)}
              />
            </div>
          }
        />

        {/* Desktop inline editor pane */}
        <Container
          className="hidden pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-2xl lg:block"
          size="md"
        >
          {selectedCard ? (
            <div className="bg-surface rounded-2xl border border-hairline shadow-sm">
              <VocaInlineEditor
                card={selectedCard}
                onSave={handleSaveCard}
                onDelete={handleDeleteCard}
              />
            </div>
          ) : (
            <EmptyState Icon={BookOpen} description="목록에서 편집할 단어 카드를 선택해주세요." />
          )}
        </Container>

        {/* Mobile View: list shown in main flow when not on desktop */}
        <Container
          className="space-y-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-2xl lg:hidden"
          size="md"
        >
          {rosterHeaderAndControls}
          <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
            <VocaCardRoster
              cards={cards}
              selectedCardId={selectedCard?.id}
              isSelectionMode={isSelectionMode}
              selectedIds={selectedIds}
              onSelectCard={handleOpenMobileCard}
              onToggleSelect={handleToggleSelectId}
            />
          </div>
          {hasMore && <LoadMoreSentinel onVisible={loadMore} />}
          {isLoading && (
            <div className="flex justify-center p-4">
              <RotateCw className="h-4 w-4 animate-spin text-meta" />
            </div>
          )}
        </Container>
      </TwoPane>

      {/* Mobile BottomSheet for card editing */}
      <BottomSheet
        isOpen={isMobileSheetOpen && selectedCard !== null}
        header={{
          title: selectedCard?.targetWord ?? "단어 카드 편집",
          description: selectedCard?.koreanMeaning,
        }}
        onClose={() => setIsMobileSheetOpen(false)}
      >
        {selectedCard && (
          <VocaInlineEditor
            card={selectedCard}
            onSave={handleSaveCard}
            onDelete={handleDeleteCard}
          />
        )}
      </BottomSheet>

      {/* Batch Actions Bar */}
      <VocaBatchActions
        selectedCount={selectedIds.size}
        onClearSelection={() => {
          setSelectedIds(new Set());
          setIsSelectionMode(false);
        }}
        onSuspendSelected={() => handleBatchSuspend(true)}
        onUnsuspendSelected={() => handleBatchSuspend(false)}
        onDeleteSelected={handleBatchDelete}
      />

      {/* AI Word Creation Dialog */}
      <AiVocaInputDialog
        isOpen={isAiDialogOpen}
        onClose={() => {
          setIsAiDialogOpen(false);
          void refresh();
        }}
      />

      {/* AI Vocabulary Recommendation Sheet */}
      <VocaRecommendSheet
        isOpen={isRecommendOpen}
        onClose={() => setIsRecommendOpen(false)}
        onCardCreated={() => void refresh()}
      />
    </div>
  );
}
