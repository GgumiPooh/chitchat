"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonPacksQuery, useAllPackSections } from "@/features/send-message/@x/react-message";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  MINI_ANIMATION_LOOP_INTERVAL,
  toPreviousReplaySrc,
  toReplaySrc,
  useViewportReplay,
  type EmoticonItemId,
  type MessageId,
} from "@/shared/lib";
import { ExpandableSheet, HapticTarget, LoadMoreSentinel, PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { DEFAULT_REACTION_EMOJIS } from "../config/default-emojis";
import { useRecentReactions } from "../model/use-recent-reactions";

export type MiniEmoticonSheetProps = {
  className?: string;
  activeEmoticonItemIds?: EmoticonItemId[] | Set<EmoticonItemId> | null;
  activeEmojis?: string[] | Set<string> | null;
  isOpen: boolean;
  messageId: MessageId | null;
  onClose: () => void;
  onSelectReaction: (
    reaction:
      | { emoji: string; reactionType: "emoji" }
      | { emoticonItemId: EmoticonItemId; reactionType: "emoticon" },
  ) => void;
};

type VirtualRow =
  | {
      title: string;
      type: "header";
      id: string;
    }
  | {
      type: "recents-row";
      items: Array<{ kind: "emoji"; value: string } | { kind: "emoticon"; value: EmoticonItemId }>;
      id: string;
    }
  | {
      items: string[];
      type: "emoji-row";
      id: string;
    }
  | {
      items: Emoticon[];
      type: "emoticon-row";
      id: string;
    }
  | {
      type: "load-more";
      id: string;
    };

const COLUMNS = 6;

export function MiniEmoticonSheet({
  className,
  activeEmoticonItemIds,
  activeEmojis,
  isOpen,
  messageId,
  onClose,
  onSelectReaction,
}: MiniEmoticonSheetProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const activeEmojiSet =
    activeEmojis instanceof Set
      ? activeEmojis
      : Array.isArray(activeEmojis)
        ? new Set(activeEmojis)
        : null;

  const activeItemSet =
    activeEmoticonItemIds instanceof Set
      ? activeEmoticonItemIds
      : Array.isArray(activeEmoticonItemIds)
        ? new Set(activeEmoticonItemIds)
        : null;

  const { recentReactions, rememberReaction } = useRecentReactions();

  const packsQuery = useQuery(toEmoticonPacksQuery());
  const miniPacks = (packsQuery.data ?? []).filter(
    (pack) => pack.type === "mini" && pack.isEnabled,
  );

  // INFO: § 13.6. The picker's 전체 tab, pack by pack as the reader scrolls — never every pack on open.
  const { sections, hasMore, loadMore } = useAllPackSections(miniPacks, isOpen);

  const handleSelectEmoji = (emoji: string) => {
    rememberReaction({ kind: "emoji", value: emoji });
    onSelectReaction({ emoji, reactionType: "emoji" });
    onClose();
  };

  const handleSelectEmoticon = (item: Emoticon) => {
    rememberReaction({ kind: "emoticon", value: item.id });
    onSelectReaction({ emoticonItemId: item.id, reactionType: "emoticon" });
    onClose();
  };

  const virtualRows = useMemo(() => {
    const rows: VirtualRow[] = [];

    // 1. 최근 사용 섹션
    if (recentReactions.length > 0) {
      rows.push({
        id: "header-recent",
        title: "최근 사용",
        type: "header",
      });

      const slicedRecents = recentReactions.slice(0, 18);
      for (let i = 0; i < slicedRecents.length; i += COLUMNS) {
        rows.push({
          id: `recent-row-${i}`,
          items: slicedRecents.slice(i, i + COLUMNS),
          type: "recents-row",
        });
      }
    }

    // 2. 기본 이모지 섹션
    rows.push({
      id: "header-default",
      title: "기본",
      type: "header",
    });

    for (let i = 0; i < DEFAULT_REACTION_EMOJIS.length; i += COLUMNS) {
      rows.push({
        id: `emoji-row-${i}`,
        items: DEFAULT_REACTION_EMOJIS.slice(i, i + COLUMNS),
        type: "emoji-row",
      });
    }

    // 3. 활성화된 미니 이모티콘 팩 섹션들
    sections.forEach(({ pack, items }) => {
      if (items.length === 0) {
        return;
      }

      rows.push({
        id: `header-pack-${pack.id}`,
        title: pack.name,
        type: "header",
      });

      for (let i = 0; i < items.length; i += COLUMNS) {
        rows.push({
          id: `pack-${pack.id}-row-${i}`,
          items: items.slice(i, i + COLUMNS),
          type: "emoticon-row",
        });
      }
    });

    // WARN: The id carries the section count so each batch is a fresh row and a fresh observer — see the picker's 전체 tab.
    if (hasMore) {
      rows.push({ id: `load-more-${sections.length}`, type: "load-more" });
    }

    return rows;
  }, [recentReactions, sections, hasMore]);

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      if (row.type === "load-more") {
        return 1;
      }
      if (row.type === "header") {
        return index === 0 ? 28 : 36;
      }
      return 56; // 6열 square-cell 높이 + gap
    },
    overscan: 15,
  });

  const isSheetOpen = isOpen && messageId !== null;

  useEffect(() => {
    if (isSheetOpen) {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      rowVirtualizer.scrollToOffset(0);
    } else {
      rowVirtualizer.scrollToOffset(0);
    }
  }, [isSheetOpen, rowVirtualizer]);

  const content = (
    <div
      ref={scrollContainerRef}
      className="relative scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain"
    >
      <div
        className="relative w-full pb-6"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const row = virtualRows[virtualRow.index];

          return (
            <div
              key={row.id}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              data-index={virtualRow.index}
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.type === "header" && (
                <div className="pt-5 pb-1 first:pt-0">
                  <h3 className="px-1 text-body-sm text-meta">{row.title}</h3>
                </div>
              )}

              {row.type === "recents-row" && (
                <div className="square-grid-6 pb-2 [--square-grid-gap:var(--spacing-xs)]">
                  {row.items.map((recent, itemIdx) => {
                    if (recent.kind === "emoji") {
                      const isSelected = activeEmojiSet?.has(recent.value) ?? false;

                      return (
                        <HapticTarget
                          key={`recent-emoji-${recent.value}-${itemIdx}`}
                          className="flex square-cell"
                          overlayClassName="touch-pan-y"
                          keepsScroll
                        >
                          <button
                            className={cn(
                              "relative flex size-full items-center justify-center rounded-xl text-2xl transition-all duration-150 active:scale-95",
                              isSelected
                                ? "border-2 border-primary bg-primary/15 text-primary"
                                : "hover:bg-surface-soft active:bg-surface-pressed",
                            )}
                            type="button"
                            aria-label={recent.value}
                            onClick={() => handleSelectEmoji(recent.value)}
                          >
                            <span>{recent.value}</span>
                          </button>
                        </HapticTarget>
                      );
                    }

                    const isSelected = activeItemSet?.has(recent.value) ?? false;

                    return (
                      <RecentMiniEmoticonButton
                        key={`recent-emoticon-${recent.value}-${itemIdx}`}
                        isSelected={isSelected}
                        itemId={recent.value}
                        onSelect={() => {
                          rememberReaction(recent);
                          onSelectReaction({
                            emoticonItemId: recent.value,
                            reactionType: "emoticon",
                          });
                          onClose();
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {row.type === "emoji-row" && (
                <div className="square-grid-6 pb-2 [--square-grid-gap:var(--spacing-xs)]">
                  {row.items.map((emoji) => {
                    const isSelected = activeEmojiSet?.has(emoji) ?? false;

                    return (
                      <HapticTarget
                        key={emoji}
                        className="flex square-cell"
                        overlayClassName="touch-pan-y"
                        keepsScroll
                      >
                        <button
                          className={cn(
                            "relative flex size-full items-center justify-center rounded-xl text-2xl transition-all duration-150 active:scale-95",
                            isSelected
                              ? "border-2 border-primary bg-primary/15 text-primary"
                              : "hover:bg-surface-soft active:bg-surface-pressed",
                          )}
                          type="button"
                          aria-label={emoji}
                          onClick={() => handleSelectEmoji(emoji)}
                        >
                          <span>{emoji}</span>
                        </button>
                      </HapticTarget>
                    );
                  })}
                </div>
              )}

              {row.type === "load-more" && (
                <LoadMoreSentinel rootRef={scrollContainerRef} onVisible={loadMore} />
              )}

              {row.type === "emoticon-row" && (
                <div className="square-grid-6 pb-2 [--square-grid-gap:var(--spacing-xs)]">
                  {row.items.map((item) => (
                    <MiniEmoticonCellButton
                      key={item.id}
                      isSelected={activeItemSet?.has(item.id) ?? false}
                      item={item}
                      onSelect={() => handleSelectEmoticon(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <ExpandableSheet
      className={className}
      isOpen={isOpen && messageId !== null}
      header={{ title: "리액션", isHidden: true }}
      onClose={onClose}
    >
      {content}
    </ExpandableSheet>
  );
}

function MiniEmoticonCellButton({
  item,
  isSelected = false,
  onSelect,
}: {
  item: Emoticon;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  // INFO: 화면에 노출될 때만 무한 반복 재생
  const { ref: replayRef, replayToken } = useViewportReplay(MINI_ANIMATION_LOOP_INTERVAL);
  const emoticonAssetUrl = toEmoticonAssetUrl(item.id, "animated-image", item.version);

  return (
    <HapticTarget className="flex square-cell" overlayClassName="touch-pan-y" keepsScroll>
      <button
        ref={replayRef}
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden rounded-xl p-1.5 transition-all duration-150 active:scale-95",
          isSelected
            ? "border-2 border-primary bg-primary/15"
            : "hover:bg-surface-soft active:bg-surface-pressed",
        )}
        type="button"
        aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "미니 이모티콘"}
        onClick={onSelect}
      >
        <PreloadImage
          key={replayToken}
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          alt=""
          previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
          hidesPreviewOnReveal
          loading={replayToken > 0 ? "eager" : "lazy"}
          draggable={false}
          src={toReplaySrc(emoticonAssetUrl, replayToken)}
        />
      </button>
    </HapticTarget>
  );
}

function RecentMiniEmoticonButton({
  itemId,
  isSelected = false,
  onSelect,
}: {
  itemId: EmoticonItemId;
  isSelected?: boolean;
  onSelect: () => void;
}) {
  const { ref: replayRef, replayToken } = useViewportReplay(MINI_ANIMATION_LOOP_INTERVAL);
  const emoticonAssetUrl = toEmoticonAssetUrl(itemId, "animated-image");

  return (
    <HapticTarget className="flex square-cell" overlayClassName="touch-pan-y" keepsScroll>
      <button
        ref={replayRef}
        className={cn(
          "relative flex size-full items-center justify-center overflow-hidden rounded-xl p-1.5 transition-all duration-150 active:scale-95",
          isSelected
            ? "border-2 border-primary bg-primary/15"
            : "hover:bg-surface-soft active:bg-surface-pressed",
        )}
        type="button"
        aria-label="최근 미니 이모티콘"
        onClick={onSelect}
      >
        <PreloadImage
          key={replayToken}
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          alt=""
          previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
          hidesPreviewOnReveal
          loading={replayToken > 0 ? "eager" : "lazy"}
          draggable={false}
          src={toReplaySrc(emoticonAssetUrl, replayToken)}
        />
      </button>
    </HapticTarget>
  );
}
