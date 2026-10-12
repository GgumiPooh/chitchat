"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { HapticTarget, LoadMoreSentinel, PreloadImage } from "@/shared/ui";
import { LoaderCircle, X } from "lucide-react";
import { useRef } from "react";
import { useEmoticonSearch } from "../model/use-emoticon-search";

export type EmoticonQuickBarProps = {
  className?: string;
  query: string;
  isOpen: boolean;
  onSelect: (item: Emoticon) => void;
  onClose: () => void;
};

/**
 * A horizontal scroll bar showing matching emoticons above the composer when typing.
 * Expands in-flow with CSS grid row transition to smoothly push the chat scroller up.
 * Supports infinite scrolling to lazily load more results as the user scrolls right.
 */
export function EmoticonQuickBar({
  className,
  query,
  isOpen,
  onSelect,
  onClose,
}: EmoticonQuickBarProps) {
  const { results, hasMore, loadMore, isLoadingMore } = useEmoticonSearch(
    query,
    isOpen && query.trim() !== "",
    false,
  );
  const scrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const isExpanded = isOpen && results.length > 0;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] ease-route",
        isExpanded ? "duration-state grid-rows-[1fr]" : "duration-columns-step grid-rows-[0fr]",
        className,
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "mx-md mb-2xs flex items-center gap-xs rounded-2xl border border-hairline bg-surface-soft/90 px-xs py-1.5 shadow-floating backdrop-blur-md",
            "transition-[opacity,transform] ease-route",
            isExpanded
              ? "duration-state translate-y-0 opacity-100"
              : "duration-columns-step translate-y-2 opacity-0",
          )}
        >
          <div
            ref={scrollerRef}
            className="scrollbar-hidden flex flex-1 touch-pan-x items-center gap-xs overflow-x-auto overscroll-contain"
          >
            {results.map((item) => {
              const url = toEmoticonAssetUrl(
                item.id,
                item.hasStill ? "still-image" : "animated-image",
                item.version,
              );

              return (
                <HapticTarget
                  key={item.id}
                  className="size-11 shrink-0"
                  overlayClassName="touch-pan-x"
                  keepsFocus
                  keepsScroll
                >
                  <button
                    className="flex size-full cursor-pointer items-center justify-center rounded-lg p-0.5 transition-transform outline-none hover:bg-canvas/50 focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
                    type="button"
                    aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "이모티콘"}
                    onPointerDown={(event) => {
                      // INFO: Prevents dropping keyboard focus on mobile WebKit.
                      event.preventDefault();
                    }}
                    onClick={() => onSelect(item)}
                  >
                    <PreloadImage
                      className="size-full"
                      imgClassName="size-full object-contain rounded-md"
                      alt=""
                      draggable={false}
                      src={url}
                    />
                  </button>
                </HapticTarget>
              );
            })}
            {isLoadingMore && (
              <div className="flex size-11 shrink-0 items-center justify-center">
                <LoaderCircle className="size-4 animate-spin text-meta" />
              </div>
            )}
            {hasMore && (
              <LoadMoreSentinel
                className="h-full w-px shrink-0"
                rootRef={scrollerRef}
                onVisible={loadMore}
              />
            )}
          </div>
          <button
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-surface-strong/60 text-meta transition-transform outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
            type="button"
            aria-label="추천 닫기"
            onPointerDown={(event) => {
              // INFO: Prevents dropping keyboard focus on mobile WebKit.
              event.preventDefault();
            }}
            onClick={onClose}
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
