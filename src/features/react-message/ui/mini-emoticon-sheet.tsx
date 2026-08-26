"use client";

import type { Emoticon } from "@/entities/emoticon";
import { fetchPackItems, toEmoticonPacksQuery } from "@/features/send-message/@x/react-message";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  MINI_ANIMATION_LOOP_INTERVAL,
  toPreviousReplaySrc,
  toReplaySrc,
  useIsDesktop,
  useSheetDrag,
  useViewportReplay,
  type EmoticonItemId,
  type MessageId,
} from "@/shared/lib";
import { HapticTarget, Modal, PreloadImage } from "@/shared/ui";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMemo, useRef } from "react";
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
  const isDesktop = useIsDesktop();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const { size, expandedHeight, pinnedHeight, isDragging, dragProps, handleProps } = useSheetDrag({
    sheetRef,
    isOpen: isOpen && messageId !== null,
    onClose,
  });

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

  const packItemsQueries = useQueries({
    queries: miniPacks.map((pack) => ({
      queryKey: ["pack-items", pack.id] as const,
      queryFn: () => fetchPackItems(pack.id),
      staleTime: 5 * 60 * 1000,
      enabled: isOpen,
    })),
  });

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
    miniPacks.forEach((pack, index) => {
      const items = packItemsQueries[index]?.data ?? [];
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

    return rows;
  }, [recentReactions, miniPacks, packItemsQueries]);

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index];
      if (row.type === "header") {
        return 28; // text-body-xs font-semibold (약 16px) + margin/padding (약 12px)
      }
      return 56; // 6열 aspect-square 셀 높이 + gap-2
    },
    overscan: 15,
  });

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
                <div className="pt-3 pb-1">
                  <h3 className="text-body-xs px-1 font-semibold text-meta">{row.title}</h3>
                </div>
              )}

              {row.type === "recents-row" && (
                <div className="grid grid-cols-6 gap-2 pb-2">
                  {row.items.map((recent, itemIdx) => {
                    if (recent.kind === "emoji") {
                      const isSelected = activeEmojiSet?.has(recent.value) ?? false;

                      return (
                        <HapticTarget
                          key={`recent-emoji-${recent.value}-${itemIdx}`}
                          className="flex aspect-square"
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
                <div className="grid grid-cols-6 gap-2 pb-2">
                  {row.items.map((emoji) => {
                    const isSelected = activeEmojiSet?.has(emoji) ?? false;

                    return (
                      <HapticTarget
                        key={emoji}
                        className="flex aspect-square"
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

              {row.type === "emoticon-row" && (
                <div className="grid grid-cols-6 gap-2 pb-2">
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

  if (isDesktop) {
    return (
      <Modal
        className={className}
        isOpen={isOpen && messageId !== null}
        size="md"
        header={{
          className: "pb-2",
          title: "리액션",
        }}
        onClose={onClose}
      >
        <div className="flex h-[380px] flex-col">{content}</div>
      </Modal>
    );
  }

  return (
    <DialogPrimitive.Root
      open={isOpen && messageId !== null}
      onOpenChange={(open: boolean) => !open && onClose()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/45 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={sheetRef}
          className={cn(
            "fixed right-0 bottom-[var(--viewport-bottom,0px)] left-(--content-left) z-50 mx-auto mb-sm flex w-[calc(100%_-_var(--spacing-sm)*2)] max-w-[calc(var(--sheet-max-width)_-_var(--spacing-sm)*2)] flex-col overflow-hidden rounded-xl border border-hairline bg-canvas p-md pb-[max(var(--spacing-md),env(safe-area-inset-bottom))] shadow-floating focus:outline-none data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:duration-200 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom",
            isDragging ? "transition-none!" : "transition-[height] duration-200 ease-out",
            className,
          )}
          style={{
            height:
              pinnedHeight !== null
                ? `${pinnedHeight}px`
                : size === "expanded"
                  ? expandedHeight > 0
                    ? `${expandedHeight}px`
                    : "calc(var(--viewport-height,100dvh) - var(--header-height,56px) - var(--spacing-sm))"
                  : "380px",
          }}
          {...dragProps}
        >
          <DialogPrimitive.Title className="sr-only">리액션</DialogPrimitive.Title>
          {/* 상단 드래그 & 토글 손잡이 */}
          <button
            className={cn(
              "mx-auto -mt-2 mb-2 flex h-6 w-full cursor-grab touch-none items-center justify-center focus-visible:outline-none active:cursor-grabbing",
              "before:absolute before:inset-x-0 before:-top-2 before:h-8 before:content-['']",
            )}
            type="button"
            aria-expanded={size === "expanded"}
            aria-label={size === "expanded" ? "리액션 창 줄이기" : "리액션 창 늘리기"}
            {...handleProps}
          >
            <span className="hover:bg-ink-muted block h-1.5 w-12 rounded-full bg-hairline-strong transition-colors" />
          </button>

          {/* 스크롤 가능한 가상화 컨텐츠 영역 */}
          <div className="-mx-md -mb-md flex min-h-0 flex-1 flex-col px-md">{content}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
    <HapticTarget className="flex aspect-square" overlayClassName="touch-pan-y" keepsScroll>
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
    <HapticTarget className="flex aspect-square" overlayClassName="touch-pan-y" keepsScroll>
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
