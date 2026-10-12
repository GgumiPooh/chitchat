"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { HapticTarget, LoadMoreSentinel, PreloadImage } from "@/shared/ui";
import { LoaderCircle, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useEmoticonSearch } from "../model/use-emoticon-search";
import { DOUBLE_TAP_WINDOW } from "./emoticon-picker";

export type EmoticonQuickBarProps = {
  className?: string;
  query: string;
  isOpen: boolean;
  onSelect: (item: Emoticon) => void;
  onQuickSend?: (item: Emoticon) => void;
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
  onQuickSend,
  onClose,
}: EmoticonQuickBarProps) {
  const { results, hasMore, loadMore, isLoadingMore } = useEmoticonSearch(
    query,
    isOpen && query.trim() !== "",
    false,
  );
  const scrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const lastTapRef = useRef<Nullable<{ at: number; id: Emoticon["id"] }>>(null);

  // INFO: REQUIREMENTS.md § 13.8. Preserves the last answered search results when further typing produces 0 results.
  const [persistedResults, setPersistedResults] = useState<Emoticon[]>([]);
  const [prevResults, setPrevResults] = useState<Emoticon[]>(results);

  if (results !== prevResults) {
    setPrevResults(results);
    if (results.length > 0) {
      setPersistedResults(results);
    }
  }

  if (query.trim() === "" && persistedResults.length > 0) {
    setPersistedResults([]);
  }

  const displayResults = results.length > 0 ? results : persistedResults;
  const isExpanded = isOpen && displayResults.length > 0;
  const isCurrentQueryAnswered = results.length > 0;

  const handleSelect = useCallback(
    (item: Emoticon) => {
      const lastTap = lastTapRef.current;
      const now = Date.now();

      if (lastTap?.id === item.id && now - lastTap.at < DOUBLE_TAP_WINDOW) {
        lastTapRef.current = null;
        if (onQuickSend) {
          onQuickSend(item);
        } else {
          onSelect(item);
        }

        return;
      }

      lastTapRef.current = { at: now, id: item.id };
      onSelect(item);
    },
    [onQuickSend, onSelect],
  );

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,margin] ease-route",
        isExpanded
          ? "duration-state -mb-1 grid-rows-[1fr]"
          : "duration-columns-step grid-rows-[0fr]",
        className,
      )}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            "mx-md mt-xs mb-0.5 flex items-center gap-xs rounded-2xl border border-hairline bg-surface-soft/90 px-xs py-1.5 shadow-floating backdrop-blur-md",
            "transition-[opacity,transform] ease-route",
            isExpanded
              ? "duration-state pointer-events-auto translate-y-0 opacity-100"
              : "duration-columns-step pointer-events-none translate-y-2 opacity-0",
          )}
        >
          <div
            ref={scrollerRef}
            className="scrollbar-hidden flex flex-1 touch-pan-x items-center gap-xs overflow-x-auto overscroll-contain"
          >
            {displayResults.map((item) => {
              const url = toEmoticonAssetUrl(
                item.id,
                item.hasStill ? "still-image" : "animated-image",
                item.version,
              );

              return (
                <button
                  key={item.id}
                  className="flex size-[54px] shrink-0 cursor-pointer touch-pan-x items-center justify-center rounded-lg p-0.5 transition-transform outline-none select-none [-webkit-touch-callout:none] hover:bg-canvas/50 focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
                  type="button"
                  aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "이모티콘"}
                  onPointerDown={(event) => {
                    // WARN: Prevents touching or clicking an emoticon from blurring the composer field, keeping the virtual keyboard open on both mobile WebKit and desktop.
                    event.preventDefault();
                  }}
                  onClick={() => handleSelect(item)}
                >
                  <PreloadImage
                    className="pointer-events-none size-full"
                    imgClassName="pointer-events-none size-full rounded-md object-contain select-none"
                    alt=""
                    draggable={false}
                    src={url}
                  />
                </button>
              );
            })}
            {isCurrentQueryAnswered && isLoadingMore && (
              <div className="flex size-[54px] shrink-0 items-center justify-center">
                <LoaderCircle className="size-4 animate-spin text-meta" />
              </div>
            )}
            {isCurrentQueryAnswered && hasMore && (
              <LoadMoreSentinel
                className="h-full w-px shrink-0"
                rootRef={scrollerRef}
                onVisible={loadMore}
              />
            )}
          </div>
          <HapticTarget className="inline-flex size-7 shrink-0" keepsFocus>
            <button
              className="flex size-full cursor-pointer items-center justify-center rounded-full bg-surface-strong/60 text-meta transition-transform outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
              type="button"
              aria-label="추천 닫기"
              onPointerDown={(event) => {
                // WARN: Prevents closing the recommendation bar from blurring the composer.
                event.preventDefault();
              }}
              onClick={onClose}
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </HapticTarget>
        </div>
      </div>
    </div>
  );
}
