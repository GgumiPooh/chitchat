"use client";

import { cn, type Nullable } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { Bookmark, ChevronDown, ChevronUp, List } from "lucide-react";

export type MessageSearchNavProps = {
  className?: string;
  counterClassName?: string;
  /** Null while no hit has been taken yet — a query still resolving shows no position. */
  activeIndex: Nullable<number>;
  total: number;
  hasOlder: boolean;
  hasNewer: boolean;
  hasNoResults: boolean;
  /** REQUIREMENTS.md § 8.19. Offered only once a caller passes it — the room's own bookmark list. */
  bookmarkCount?: number;
  onOpenList: () => void;
  onOlder: () => void;
  onNewer: () => void;
  onOpenBookmarks?: () => void;
};

/**
 * Steps through the hits one at a time (REQUIREMENTS.md § 8.6.1.), from the
 * composer's own position — the composer is withheld while a search is open, so
 * this is what the thumb finds where it was.
 */
export function MessageSearchNav({
  className,
  counterClassName,
  activeIndex,
  total,
  hasOlder,
  hasNewer,
  hasNoResults,
  bookmarkCount,
  onOpenList,
  onOlder,
  onNewer,
  onOpenBookmarks,
}: MessageSearchNavProps) {
  return (
    // WARN: DESIGN.md § 3.5. Transparent to the pointer at the root so the messages underneath stay tappable; only the bar itself takes taps.
    <div className={cn("pointer-events-none px-md pt-xs pb-xs", className)}>
      {/* INFO: DESIGN.md § 6.6. The composer's pill exactly — it stands in the same place, so it is the same object as far as the screen is concerned. */}
      <div className="pointer-events-auto flex items-center gap-2xs rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
        <IconButton
          Icon={List}
          haptic
          disabled={total === 0}
          aria-label="검색 결과 목록"
          onClick={onOpenList}
        />
        {onOpenBookmarks && (
          <IconButton
            Icon={Bookmark}
            haptic
            disabled={bookmarkCount === 0}
            aria-label="책갈피 목록"
            onClick={onOpenBookmarks}
          />
        )}
        <p
          className={cn("flex-1 text-center text-caption text-meta tabular-nums", counterClassName)}
        >
          {hasNoResults
            ? "결과가 없어요"
            : activeIndex === null
              ? ""
              : `${activeIndex + 1}/${total}`}
        </p>
        {/* INFO: § 8.6.1. Older is up because the conversation runs oldest to newest down the screen — the arrow points the way the room is about to move, not the way the result list is ordered. */}
        <IconButton
          Icon={ChevronUp}
          haptic
          disabled={!hasOlder}
          aria-label="이전 검색 결과"
          onClick={onOlder}
        />
        <IconButton
          Icon={ChevronDown}
          haptic
          disabled={!hasNewer}
          aria-label="다음 검색 결과"
          onClick={onNewer}
        />
      </div>
    </div>
  );
}
