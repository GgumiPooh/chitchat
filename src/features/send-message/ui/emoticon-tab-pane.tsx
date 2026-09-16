"use client";

import type { Emoticon, EmoticonPackSummary } from "@/entities/emoticon";
import type { EmoticonPackType } from "@/shared/db";
import { cn, type Nullable } from "@/shared/lib";
import { EmptyState, LoadMoreSentinel, Skeleton } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Smile } from "lucide-react";
import {
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { FOCUS_HEADING_ATTRIBUTE, FOCUS_INDEX_ATTRIBUTE } from "../model/emoticon-focus";
import { isAllTabId, isPackTabId, isRecentsTabId } from "../model/emoticon-tabs";
import { toEmoticonPackItemsQuery } from "../model/pack-items-query";
import { CELL_KEYBOARD_RING, EmoticonCell } from "./emoticon-cell";
import { EmoticonGrid } from "./emoticon-grid";

const NO_ITEMS: Emoticon[] = [];

export type AllSectionData = {
  isPending: boolean;
  items: Emoticon[];
  pack: EmoticonPackSummary;
};

export type EmoticonTabPaneProps = {
  className?: string;
  allSections?: AllSectionData[];
  eagerCount?: number;
  emptyMessage?: string;
  favorites?: Emoticon[];
  focusableIndex: number;
  hasMoreAllSections?: boolean;
  isItemsPending?: boolean;
  isKeyboardDriven: boolean;
  isWarmed?: boolean;
  items?: Emoticon[];
  loadMoreAllSections?: () => void;
  menuKind: EmoticonPackType;
  recents?: Emoticon[];
  recentsVisibleRows?: number;
  scrollerRef?: RefObject<Nullable<HTMLDivElement>>;
  tabId: string;
  tabLabel?: string;
  /** INFO: § 13.6. Horizontal swipe handlers forwarded from the picker to drive tab changes. */
  swipeHandlers?: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
    onPointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
    onClickCapture: (event: MouseEvent<HTMLDivElement>) => void;
  };
  onCellFocus?: (event: FocusEvent<HTMLDivElement>) => void;
  onCellKeys?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onExpandRecents?: () => void;
  onFocusCell?: (index: number) => void;
  onSelect: (item: Emoticon) => void;
};

/**
 * Renders an independent vertically-scrollable pane for a single tab.
 * Supports Recents (with favorites and expand), All (with pack sections), and Pack tabs.
 */
export function EmoticonTabPane({
  className,
  allSections = [],
  eagerCount = 0,
  emptyMessage,
  favorites = NO_ITEMS,
  focusableIndex,
  hasMoreAllSections = false,
  isItemsPending = false,
  isKeyboardDriven,
  isWarmed = false,
  items,
  loadMoreAllSections,
  menuKind,
  recents = NO_ITEMS,
  recentsVisibleRows = 2,
  scrollerRef,
  swipeHandlers,
  tabId,
  tabLabel = "",
  onCellFocus,
  onCellKeys,
  onExpandRecents,
  onFocusCell,
  onSelect,
}: EmoticonTabPaneProps) {
  const localScrollerRef = useRef<Nullable<HTMLDivElement>>(null);
  const targetScrollerRef = scrollerRef ?? localScrollerRef;

  const isPack = isPackTabId(tabId);
  // INFO: If items was not passed from caller, query items directly for adjacent pack tabs.
  const { data: queriedPackItems = NO_ITEMS, isPending: isPackQueryPending } = useQuery({
    ...toEmoticonPackItemsQuery(isPack && items === undefined ? tabId : null),
    enabled: isPack && items === undefined,
  });

  const packItems = items ?? queriedPackItems;
  const isPending = items !== undefined ? isItemsPending : isPackQueryPending;

  const isRecents = isRecentsTabId(tabId);
  const isAll = isAllTabId(tabId);

  const columns = menuKind === "mini" ? 6 : 4;
  const hasMoreRecents = recents.length > recentsVisibleRows * columns;
  const recentsSliceCount = hasMoreRecents
    ? recentsVisibleRows * columns - 1
    : recentsVisibleRows * columns;
  const displayedRecents = recents.slice(0, recentsSliceCount);
  const recentsSectionCount =
    recents.length === 0 ? 0 : hasMoreRecents ? recentsVisibleRows * columns : recents.length;

  return (
    <div
      ref={targetScrollerRef}
      className={cn(
        "scrollbar-hidden h-full min-h-0 flex-1 touch-pan-x touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain p-xs",
        className,
      )}
      onKeyDown={onCellKeys}
      onFocus={onCellFocus}
      {...swipeHandlers}
    >
      {!isRecents && !isAll && tabLabel !== "" && (
        <h2 className="pb-xs text-body-sm text-meta" {...{ [FOCUS_HEADING_ATTRIBUTE]: "" }}>
          {tabLabel}
        </h2>
      )}

      {isPending ? (
        <div className={menuKind === "mini" ? "square-grid-6" : "square-grid-4"} aria-hidden>
          {Array.from({ length: menuKind === "mini" ? 18 : 12 }).map((_, index) => (
            <div key={index} className="flex">
              <div className="square-cell w-full p-2xs">
                <Skeleton className="size-full rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      ) : isRecents ? (
        menuKind === "mini" ? (
          recents.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent"
              Icon={Smile}
              description={emptyMessage ?? "최근 사용한 미니이모티콘이 여기에 보여요"}
            />
          ) : (
            <EmoticonGrid
              items={recents}
              isMini
              focusableIndex={focusableIndex}
              isKeyboardDriven={isKeyboardDriven}
              isWarmed={isWarmed}
              eagerCount={eagerCount}
              ariaLabel="최근 사용한 미니이모티콘"
              onSelect={onSelect}
              onFocusCell={onFocusCell}
            />
          )
        ) : (
          <div className="flex flex-col gap-md">
            <section>
              <h2 className="pb-xs text-body-sm text-meta" {...{ [FOCUS_HEADING_ATTRIBUTE]: "" }}>
                최근 사용
              </h2>
              {recents.length === 0 ? (
                <EmptyState
                  className="border-0 bg-transparent"
                  Icon={Smile}
                  description={emptyMessage ?? "최근 사용한 이모티콘이 여기에 보여요"}
                />
              ) : (
                <div className="square-grid-4" role="group" aria-label="최근 사용한 이모티콘">
                  {displayedRecents.map((item, index) => (
                    <EmoticonCell
                      key={item.id}
                      className="flex"
                      buttonClassName="square-cell w-full"
                      item={item}
                      index={index}
                      isFocusable={index === focusableIndex}
                      isWarmed={isWarmed}
                      eagerCount={eagerCount}
                      isKeyboardDriven={isKeyboardDriven}
                      isMini={false}
                      onSelect={onSelect}
                      onFocusCell={onFocusCell}
                    />
                  ))}
                  {hasMoreRecents && (
                    <button
                      className={cn(
                        "flex square-cell w-full cursor-pointer flex-col items-center justify-center rounded-sm text-body-sm text-meta transition-colors select-none [-webkit-touch-callout:none] hover:bg-surface-soft hover:text-body focus-visible:bg-primary-tint focus-visible:text-body focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset active:bg-surface-soft active:text-body",
                        isKeyboardDriven && CELL_KEYBOARD_RING,
                      )}
                      type="button"
                      tabIndex={recentsSliceCount === focusableIndex ? 0 : -1}
                      aria-label="최근 사용한 이모티콘 더보기"
                      {...{ [FOCUS_INDEX_ATTRIBUTE]: recentsSliceCount }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        onExpandRecents?.();
                      }}
                    >
                      <span className="leading-tight">더보기</span>
                      <ChevronDown className="-mt-1 size-6" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              )}
            </section>
            <section>
              <h2 className="pb-xs text-body-sm text-meta" {...{ [FOCUS_HEADING_ATTRIBUTE]: "" }}>
                즐겨찾기
              </h2>
              {favorites.length === 0 ? (
                <EmptyState
                  className="border-0 bg-transparent"
                  Icon={Smile}
                  description="즐겨찾기한 이모티콘이 여기에 보여요"
                />
              ) : (
                <EmoticonGrid
                  items={favorites}
                  offset={recentsSectionCount}
                  isMini={false}
                  focusableIndex={focusableIndex}
                  isKeyboardDriven={isKeyboardDriven}
                  isWarmed={isWarmed}
                  eagerCount={eagerCount}
                  ariaLabel="즐겨찾기한 이모티콘"
                  onSelect={onSelect}
                  onFocusCell={onFocusCell}
                />
              )}
            </section>
          </div>
        )
      ) : isAll ? (
        <div className="flex flex-col gap-md">
          {allSections.map((section, sectionIndex) => {
            if (section.items.length === 0) {
              return null;
            }

            const offset = allSections
              .slice(0, sectionIndex)
              .reduce((count, prior) => count + prior.items.length, 0);

            return (
              <section key={section.pack.id}>
                <h2 className="pb-xs text-body-sm text-meta" {...{ [FOCUS_HEADING_ATTRIBUTE]: "" }}>
                  {section.pack.name}
                </h2>
                <EmoticonGrid
                  items={section.items}
                  offset={offset}
                  isMini={menuKind === "mini"}
                  focusableIndex={focusableIndex}
                  isKeyboardDriven={isKeyboardDriven}
                  isWarmed={isWarmed}
                  eagerCount={eagerCount}
                  ariaLabel={section.pack.name}
                  onSelect={onSelect}
                  onFocusCell={onFocusCell}
                />
              </section>
            );
          })}
          {hasMoreAllSections && (
            <LoadMoreSentinel
              key={allSections.length}
              rootRef={targetScrollerRef}
              onVisible={loadMoreAllSections ?? (() => {})}
            />
          )}
        </div>
      ) : packItems.length === 0 ? (
        <EmptyState
          className="border-0 bg-transparent"
          Icon={Smile}
          description={
            emptyMessage ??
            (menuKind === "mini"
              ? "이 묶음에는 미니이모티콘이 없어요"
              : "이 묶음에는 이모티콘이 없어요")
          }
        />
      ) : (
        <EmoticonGrid
          items={packItems}
          isMini={menuKind === "mini"}
          focusableIndex={focusableIndex}
          isKeyboardDriven={isKeyboardDriven}
          isWarmed={isWarmed}
          eagerCount={eagerCount}
          ariaLabel={tabLabel || "이모티콘"}
          onSelect={onSelect}
          onFocusCell={onFocusCell}
        />
      )}
    </div>
  );
}
