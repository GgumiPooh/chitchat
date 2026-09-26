"use client";

import type { VocaCard } from "@/entities/voca";
import { cn, type VocaCardId } from "@/shared/lib";
import { VocaAudioButton } from "@/shared/ui";
import { VocaStatusBadge } from "./voca-status-badge";

export type VocaCardRosterProps = {
  className?: string;
  cards: VocaCard[];
  selectedCardId?: VocaCardId | null;
  selectedIds?: Set<VocaCardId>;
  isSelectionMode?: boolean;
  onSelectCard: (card: VocaCard) => void;
  onToggleSelect?: (id: VocaCardId) => void;
};

export function VocaCardRoster({
  className,
  cards,
  selectedCardId,
  selectedIds,
  isSelectionMode = false,
  onSelectCard,
  onToggleSelect,
}: VocaCardRosterProps) {
  if (cards.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center p-12 text-center", className)}>
        <p className="text-body-sm font-medium text-meta">단어가 없습니다.</p>
        <p className="mt-1 text-caption text-meta-soft">
          새 단어를 추가하거나 다른 검색 조건을 선택해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("divide-y divide-hairline/60", className)}>
      {cards.map((card) => {
        const isCurrent = selectedCardId === card.id;
        const isChecked = selectedIds?.has(card.id) ?? false;

        return (
          <div
            key={card.id}
            className={cn(
              "flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors",
              "hover:bg-surface-soft focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-soft/80",
              isCurrent && "bg-surface-soft/90 font-medium",
            )}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (isSelectionMode && onToggleSelect) {
                onToggleSelect(card.id);
              } else {
                onSelectCard(card);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (isSelectionMode && onToggleSelect) {
                  onToggleSelect(card.id);
                } else {
                  onSelectCard(card);
                }
              }
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {isSelectionMode && (
                <input
                  className="h-4 w-4 rounded border-hairline text-primary focus:ring-primary"
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(card.id);
                  }}
                />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-body-md font-semibold text-ink">
                    {card.targetWord}
                  </span>
                  <span className="text-caption font-normal text-meta">{card.pos}</span>
                  <span className="font-mono text-caption text-meta-soft">
                    {card.pronunciation}
                  </span>
                </div>
                <p className="truncate text-body-sm text-body">{card.koreanMeaning}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <VocaStatusBadge state={card.state} suspended={card.suspended} />
              <div onClick={(e) => e.stopPropagation()}>
                <VocaAudioButton
                  audioUrl={card.audioUrl}
                  textToSpeak={card.targetWord}
                  size="sm"
                  label={`${card.targetWord} 듣기`}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
