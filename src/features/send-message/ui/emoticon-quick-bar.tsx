"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  isBareKey,
  isCommandKey,
  useIsomorphicLayoutEffect,
  type Nullable,
} from "@/shared/lib";
import { HapticTarget, LoadMoreSentinel, PreloadImage, Skeleton } from "@/shared/ui";
import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useEmoticonSearch } from "../model/use-emoticon-search";
import { useHiddenEmoticonPacks } from "../model/use-hidden-emoticon-packs";
import { CELL_KEYBOARD_RING } from "./emoticon-cell";
import { DOUBLE_TAP_WINDOW } from "./emoticon-picker";

const SKELETON_COUNT = 3;
const CLOSE_BUTTON_INDEX = -2;
const PEEK_MARGIN = 8;

export type EmoticonQuickBarHandle = {
  focusCurrent: () => boolean;
  focusFirst: () => boolean;
};

export type EmoticonQuickBarProps = {
  ref?: Ref<EmoticonQuickBarHandle>;
  className?: string;
  query: string;
  isOpen: boolean;
  onSelect: (item: Emoticon) => void;
  onQuickSend?: (item: Emoticon) => void;
  onClose: () => void;
  onFocusComposer?: () => void;
};

/**
 * Scrolls `item` into view inside `scroller`, smoothly keeping `peekItem` in view
 * in the direction of motion so the user can anticipate upcoming results.
 */
function revealQuickBarItem(
  scroller: HTMLElement,
  item: HTMLElement,
  peekItem: Nullable<HTMLElement>,
  direction: 1 | -1,
): void {
  const scrollerRect = scroller.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();

  let delta = 0;

  if (direction === 1) {
    if (peekItem) {
      const peekRect = peekItem.getBoundingClientRect();
      if (peekRect.right > scrollerRect.right) {
        delta = peekRect.right - scrollerRect.right + PEEK_MARGIN;
      }
    } else if (itemRect.right > scrollerRect.right) {
      delta = itemRect.right - scrollerRect.right + PEEK_MARGIN;
    }

    if (itemRect.left < scrollerRect.left) {
      delta = itemRect.left - scrollerRect.left - PEEK_MARGIN;
    }
  } else {
    if (peekItem) {
      const peekRect = peekItem.getBoundingClientRect();
      if (peekRect.left < scrollerRect.left) {
        delta = peekRect.left - scrollerRect.left - PEEK_MARGIN;
      }
    } else if (itemRect.left < scrollerRect.left) {
      delta = itemRect.left - scrollerRect.left - PEEK_MARGIN;
    }

    if (itemRect.right > scrollerRect.right) {
      delta = itemRect.right - scrollerRect.right + PEEK_MARGIN;
    }
  }

  if (Math.abs(delta) >= 1) {
    const maxScroll = scroller.scrollWidth - scroller.clientWidth;
    const targetScroll = Math.max(0, Math.min(maxScroll, scroller.scrollLeft + delta));
    scroller.scrollTo({
      left: targetScroll,
      behavior: "smooth",
    });
  }
}

/**
 * A horizontal scroll bar showing matching emoticons above the composer when typing.
 * Expands in-flow with CSS grid row transition to smoothly push the chat scroller up.
 * Supports infinite scrolling to lazily load more results as the user scrolls right,
 * with full desktop keyboard navigation, roving tabindex, and peek-ahead scrolling.
 */
export function EmoticonQuickBar({
  ref,
  className,
  query,
  isOpen,
  onSelect,
  onQuickSend,
  onClose,
  onFocusComposer,
}: EmoticonQuickBarProps) {
  const { results, hasMore, loadMore, isLoadingMore } = useEmoticonSearch(
    query,
    isOpen && query.trim() !== "",
    false,
  );
  const { isOfficeMode, isPackHidden } = useHiddenEmoticonPacks();
  const containerRef = useRef<Nullable<HTMLDivElement>>(null);
  const scrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const itemRefs = useRef<Array<Nullable<HTMLButtonElement>>>([]);
  const closeButtonRef = useRef<Nullable<HTMLButtonElement>>(null);

  const lastTapRef = useRef<Nullable<{ at: number; id: Emoticon["id"] }>>(null);
  const lastKeyboardSelectedIdRef = useRef<Nullable<Emoticon["id"]>>(null);

  const [focusIndex, setFocusIndex] = useState(0);
  const [isKeyboardDriven, setIsKeyboardDriven] = useState(false);
  const lastFocusedIndexRef = useRef(0);
  const hasBarFocusRef = useRef(false);

  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    setFocusIndex(0);
  }

  useEffect(() => {
    lastFocusedIndexRef.current = 0;
  }, [query]);

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

  const skeletonCount = isCurrentQueryAnswered && isLoadingMore ? SKELETON_COUNT : 0;
  const totalItems = displayResults.length + skeletonCount;

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setFocusIndex(0);
      setIsKeyboardDriven(false);
    }
  }

  useEffect(() => {
    if (!isOpen) {
      lastKeyboardSelectedIdRef.current = null;
      lastFocusedIndexRef.current = 0;
      hasBarFocusRef.current = false;
    }
  }, [isOpen]);

  // INFO: Restores focus to the real emoticon item when loading finishes and skeletons are replaced.
  useIsomorphicLayoutEffect(() => {
    if (!hasBarFocusRef.current) {
      return;
    }

    const targetIndex = Math.min(Math.max(0, focusIndex), displayResults.length - 1);

    if (targetIndex < 0) {
      return;
    }

    const activeEl = document.activeElement;
    const isFocusLostOrInScroller =
      activeEl === null || activeEl === document.body || scrollerRef.current?.contains(activeEl);

    if (isFocusLostOrInScroller) {
      if (focusIndex !== targetIndex) {
        setFocusIndex(targetIndex);
      }
      lastFocusedIndexRef.current = targetIndex;

      const targetEl = itemRefs.current[targetIndex];
      if (targetEl) {
        targetEl.focus({ preventScroll: true });
        if (scrollerRef.current) {
          const peekEl = itemRefs.current[targetIndex + 1] ?? null;
          revealQuickBarItem(scrollerRef.current, targetEl, peekEl, 1);
        }
      }
    }
  }, [displayResults, isLoadingMore]);

  const focusItemAtIndex = useCallback(
    (targetIndex: number, direction: 1 | -1) => {
      setFocusIndex(targetIndex);
      setIsKeyboardDriven(true);
      hasBarFocusRef.current = true;
      if (targetIndex >= 0) {
        lastFocusedIndexRef.current = targetIndex;
      }

      const targetEl = itemRefs.current[targetIndex];
      if (!targetEl) {
        return;
      }

      targetEl.focus({ preventScroll: true });

      const scroller = scrollerRef.current;
      if (!scroller) {
        return;
      }

      const peekIndex = direction === 1 ? targetIndex + 1 : targetIndex - 1;
      const peekEl = itemRefs.current[peekIndex] ?? null;

      revealQuickBarItem(scroller, targetEl, peekEl, direction);

      // INFO: Proactive infinite load trigger when approaching the end of loaded results.
      if (targetIndex >= displayResults.length - 2) {
        if (isCurrentQueryAnswered && hasMore && !isLoadingMore) {
          loadMore();
        }
      }
    },
    [displayResults.length, hasMore, isCurrentQueryAnswered, isLoadingMore, loadMore],
  );

  useImperativeHandle(ref, () => ({
    focusCurrent: () => {
      if (!isExpanded || displayResults.length === 0) {
        return false;
      }

      setIsKeyboardDriven(true);
      hasBarFocusRef.current = true;
      const targetIndex = Math.min(
        Math.max(0, lastFocusedIndexRef.current),
        displayResults.length - 1,
      );
      setFocusIndex(targetIndex);

      const targetButton = itemRefs.current[targetIndex];
      if (targetButton) {
        targetButton.focus({ preventScroll: true });
        const scroller = scrollerRef.current;
        if (scroller) {
          if (targetIndex === 0) {
            scroller.scrollTo({ left: 0, behavior: "smooth" });
          } else {
            const peekEl = itemRefs.current[targetIndex + 1] ?? null;
            revealQuickBarItem(scroller, targetButton, peekEl, 1);
          }
        }

        return true;
      }

      return false;
    },
    focusFirst: () => {
      if (!isExpanded || displayResults.length === 0) {
        return false;
      }

      setIsKeyboardDriven(true);
      hasBarFocusRef.current = true;
      lastFocusedIndexRef.current = 0;
      setFocusIndex(0);

      const firstButton = itemRefs.current[0];
      if (firstButton) {
        firstButton.focus({ preventScroll: true });
        if (scrollerRef.current) {
          scrollerRef.current.scrollTo({ left: 0, behavior: "smooth" });
        }

        return true;
      }

      return false;
    },
  }));

  const handleSelect = useCallback(
    (item: Emoticon) => {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(10);
        } catch {
          // INFO: Silently ignore devices that block vibrate
        }
      }

      const lastTap = lastTapRef.current;
      const now = Date.now();

      if (lastTap?.id === item.id && now - lastTap.at < DOUBLE_TAP_WINDOW) {
        lastTapRef.current = null;
        if (onQuickSend) {
          // WARN: DESIGN.md § 7.15.3. A task, so the `keepsScroll` overlay outlives the dispatch before the bar dismisses.
          setTimeout(() => {
            onQuickSend(item);
          });
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

  const handleItemKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number, item: Emoticon) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (index < totalItems - 1) {
          focusItemAtIndex(index + 1, 1);

          return;
        }

        // WARN: Navigation stops at the last skeleton while loading; it cannot reach the close button.
        if (isLoadingMore) {
          return;
        }

        if (hasMore) {
          loadMore();

          return;
        }

        // INFO: When all items have finished loading, moving right from the final item reaches the close button.
        setFocusIndex(CLOSE_BUTTON_INDEX);
        closeButtonRef.current?.focus({ preventScroll: true });

        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (index > 0) {
          focusItemAtIndex(index - 1, -1);
        }

        return;
      }

      if (event.key === "ArrowDown" || event.key === "Escape") {
        event.preventDefault();
        hasBarFocusRef.current = false;
        onFocusComposer?.();

        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        focusItemAtIndex(0, -1);

        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        if (!isLoadingMore && !hasMore) {
          setFocusIndex(CLOSE_BUTTON_INDEX);
          closeButtonRef.current?.focus({ preventScroll: true });
        } else {
          focusItemAtIndex(totalItems - 1, 1);
        }

        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        if (isCommandKey(event)) {
          if (onQuickSend) {
            onQuickSend(item);
          } else {
            onSelect(item);
          }

          return;
        }

        // INFO: REQUIREMENTS.md § 8.14. Keyboard stage-then-send without a time window.
        if (lastKeyboardSelectedIdRef.current === item.id) {
          lastKeyboardSelectedIdRef.current = null;
          if (onQuickSend) {
            onQuickSend(item);
          } else {
            onSelect(item);
          }

          return;
        }

        lastKeyboardSelectedIdRef.current = item.id;
        onSelect(item);
      }
    },
    [
      focusItemAtIndex,
      hasMore,
      isLoadingMore,
      loadMore,
      onFocusComposer,
      onQuickSend,
      onSelect,
      totalItems,
    ],
  );

  const handleSkeletonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, skeletonIndex: number) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (skeletonIndex > 0) {
          focusItemAtIndex(skeletonIndex - 1, -1);
        }

        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (skeletonIndex < totalItems - 1) {
          focusItemAtIndex(skeletonIndex + 1, 1);
        }

        // WARN: Blocked from reaching the close button while loading more.
        return;
      }

      if (event.key === "ArrowDown" || event.key === "Escape") {
        event.preventDefault();
        hasBarFocusRef.current = false;
        onFocusComposer?.();

        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
      }
    },
    [focusItemAtIndex, onFocusComposer, totalItems],
  );

  const handleCloseButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const lastIndex = totalItems - 1;
        if (lastIndex >= 0) {
          focusItemAtIndex(lastIndex, -1);
        }

        return;
      }

      if (event.key === "ArrowDown" || event.key === "Escape") {
        event.preventDefault();
        hasBarFocusRef.current = false;
        onFocusComposer?.();

        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        hasBarFocusRef.current = false;
        onClose();
      }
    },
    [focusItemAtIndex, onClose, onFocusComposer, totalItems],
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
          ref={containerRef}
          className={cn(
            "mx-md mt-xs mb-0.5 flex items-center gap-xs rounded-2xl border border-hairline bg-surface-soft/90 px-xs py-1.5 shadow-floating backdrop-blur-md",
            "transition-[opacity,transform] ease-route",
            isExpanded
              ? "duration-state pointer-events-auto translate-y-0 opacity-100"
              : "duration-columns-step pointer-events-none translate-y-2 opacity-0",
          )}
          onFocusCapture={() => {
            hasBarFocusRef.current = true;
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget !== null &&
              !containerRef.current?.contains(event.relatedTarget as Node)
            ) {
              hasBarFocusRef.current = false;
            }
          }}
          onPointerDownCapture={() => {
            setIsKeyboardDriven(false);
          }}
        >
          <div
            ref={scrollerRef}
            className="scrollbar-hidden flex flex-1 touch-pan-x items-center gap-xs overflow-x-auto overscroll-contain"
          >
            {displayResults.map((item, index) => {
              const isAssetBlocked = isOfficeMode && isPackHidden(item.packId);
              const url = isAssetBlocked
                ? ""
                : toEmoticonAssetUrl(
                    item.id,
                    item.hasStill ? "still-image" : "animated-image",
                    item.version,
                  );
              const isFocusable = focusIndex === index;

              return (
                <HapticTarget
                  key={item.id}
                  className="size-[54px] shrink-0"
                  overlayClassName="touch-pan-x"
                  keepsFocus
                  keepsScroll
                >
                  <button
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    className={cn(
                      "flex size-full cursor-pointer touch-pan-x items-center justify-center rounded-sm p-0.5 transition-transform outline-none select-none [-webkit-touch-callout:none] group-data-[pressed]:scale-95 hover:bg-canvas/50 active:scale-95",
                      isKeyboardDriven && CELL_KEYBOARD_RING,
                    )}
                    tabIndex={isFocusable ? 0 : -1}
                    type="button"
                    aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "이모티콘"}
                    data-emoticon-quick-index={index}
                    onMouseDown={(event) => {
                      // WARN: Prevents browser native mousedown focus scroll from jumping.
                      event.preventDefault();
                    }}
                    onClick={(event) => {
                      setIsKeyboardDriven(false);
                      hasBarFocusRef.current = true;
                      event.currentTarget.focus({ preventScroll: true });
                      setFocusIndex(index);
                      lastFocusedIndexRef.current = index;
                      lastKeyboardSelectedIdRef.current = null;
                      handleSelect(item);
                    }}
                    onKeyDown={(event) => {
                      setIsKeyboardDriven(true);
                      if (isBareKey(event) || isCommandKey(event)) {
                        handleItemKeyDown(event, index, item);
                      }
                    }}
                  >
                    {isAssetBlocked ? (
                      <div className="flex size-full flex-col items-center justify-center p-1 text-center select-none">
                        <span className="truncate text-caption font-medium text-meta">
                          {item.keywords[0] ?? "이모티콘"}
                        </span>
                      </div>
                    ) : (
                      <PreloadImage
                        className="pointer-events-none size-full overflow-hidden rounded-xs"
                        imgClassName="pointer-events-none size-full object-contain select-none"
                        placeholderClassName="rounded-xs"
                        alt=""
                        draggable={false}
                        src={url}
                      />
                    )}
                  </button>
                </HapticTarget>
              );
            })}
            {isCurrentQueryAnswered &&
              isLoadingMore &&
              Array.from({ length: SKELETON_COUNT }).map((_, skeletonOffset) => {
                const skeletonIndex = displayResults.length + skeletonOffset;
                const isFocusable = focusIndex === skeletonIndex;

                return (
                  <HapticTarget
                    key={`skeleton-${skeletonOffset}`}
                    className="size-[54px] shrink-0"
                    overlayClassName="touch-pan-x"
                    keepsFocus
                    keepsScroll
                  >
                    <button
                      ref={(el) => {
                        itemRefs.current[skeletonIndex] = el;
                      }}
                      className={cn(
                        "flex size-full cursor-default touch-pan-x items-center justify-center rounded-sm p-0.5 outline-none select-none",
                        isKeyboardDriven && CELL_KEYBOARD_RING,
                      )}
                      tabIndex={isFocusable ? 0 : -1}
                      type="button"
                      aria-label="이모티콘 불러오는 중"
                      aria-disabled="true"
                      data-emoticon-quick-index={skeletonIndex}
                      onPointerDown={(event) => {
                        setIsKeyboardDriven(false);
                        event.preventDefault();
                      }}
                      onKeyDown={(event) => {
                        setIsKeyboardDriven(true);
                        if (isBareKey(event)) {
                          handleSkeletonKeyDown(event, skeletonIndex);
                        }
                      }}
                    >
                      <Skeleton className="size-full rounded-xs" />
                    </button>
                  </HapticTarget>
                );
              })}
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
              ref={closeButtonRef}
              className={cn(
                "flex size-full cursor-pointer items-center justify-center rounded-full bg-surface-strong/60 text-meta transition-transform outline-none hover:text-ink active:scale-95",
                isKeyboardDriven &&
                  "focus:bg-surface-strong focus:text-ink focus:ring-2 focus:ring-primary focus:outline-none",
              )}
              tabIndex={focusIndex === CLOSE_BUTTON_INDEX ? 0 : -1}
              type="button"
              aria-label="추천 닫기"
              onPointerDown={(event) => {
                setIsKeyboardDriven(false);
                event.preventDefault();
              }}
              onKeyDown={(event) => {
                setIsKeyboardDriven(true);
                if (isBareKey(event)) {
                  handleCloseButtonKeyDown(event);
                }
              }}
              onClick={() => {
                hasBarFocusRef.current = false;
                onClose();
              }}
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </HapticTarget>
        </div>
      </div>
    </div>
  );
}
