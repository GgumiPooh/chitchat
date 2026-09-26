"use client";

import type { VocaCard } from "@/entities/voca";
import { AiVocaInputDialog } from "@/features/voca-ai-create";
import {
  useVocaCards,
  VocaBatchActions,
  VocaCardRoster,
  VocaInlineEditor,
} from "@/features/voca-browser";
import { VOCA_ROUTE } from "@/shared/config";
import { cn, type VocaCardId } from "@/shared/lib";
import {
  AppHeader,
  BottomSheet,
  Container,
  EmptyState,
  IconButton,
  LoadMoreSentinel,
  TwoPane,
} from "@/shared/ui";
import { BookOpen, CheckSquare, ChevronLeft, RotateCw, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export type VocaCardsPageProps = {
  className?: string;
  initialCards: VocaCard[];
  initialNextCursor?: VocaCardId | null;
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
  const [selectedCard, setSelectedCard] = useState<VocaCard | null>(() => initialCards[0] ?? null);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<VocaCardId>>(new Set());

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

  const handleSelectCard = (card: VocaCard) => {
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
    <div className="space-y-3 p-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-meta" />
        <input
          className="w-full rounded-xl border border-hairline bg-surface-soft py-2.5 pr-4 pl-9 text-body-sm text-ink placeholder:text-meta-soft focus:border-primary focus:outline-none"
          type="text"
          placeholder="단어, 뜻, 문장 검색..."
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
      <AppHeader
        title="단어장"
        hasSidePanel
        leading={
          <IconButton
            Icon={ChevronLeft}
            variant="floating"
            haptic
            aria-label="영단어로 돌아가기"
            onClick={() => router.push(VOCA_ROUTE)}
          />
        }
        trailing={
          <div className="flex items-center gap-xs">
            <IconButton
              className={cn(isSelectionMode && "border-primary text-primary")}
              Icon={CheckSquare}
              variant="floating"
              haptic
              aria-label="선택 모드"
              onClick={() => {
                setIsSelectionMode((prev) => !prev);
                setSelectedIds(new Set());
              }}
            />
            <IconButton
              Icon={Sparkles}
              variant="floating"
              haptic
              aria-label="AI로 단어 추가"
              onClick={() => setIsAiDialogOpen(true)}
            />
          </div>
        }
      />

      {/* Responsive layout with TwoPane on desktop */}
      <TwoPane
        className="pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-2xl"
        panel={
          <div className="flex h-full flex-col">
            {rosterHeaderAndControls}
            <div className="flex-1 overflow-y-auto">
              <VocaCardRoster
                cards={cards}
                selectedCardId={selectedCard?.id}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                onSelectCard={handleSelectCard}
                onToggleSelect={handleToggleSelectId}
              />
              {hasMore && <LoadMoreSentinel onVisible={loadMore} />}
              {isLoading && (
                <div className="flex justify-center p-4">
                  <RotateCw className="h-4 w-4 animate-spin text-meta" />
                </div>
              )}
            </div>
          </div>
        }
      >
        {/* Desktop inline editor pane */}
        <Container className="hidden lg:block" size="md">
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
        <Container className="space-y-md lg:hidden" size="md">
          {rosterHeaderAndControls}
          <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
            <VocaCardRoster
              cards={cards}
              selectedCardId={selectedCard?.id}
              isSelectionMode={isSelectionMode}
              selectedIds={selectedIds}
              onSelectCard={handleSelectCard}
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
    </div>
  );
}
