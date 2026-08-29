"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import {
  EMOTICON_KIND_NOUNS,
  MAX_EMOTICON_PACK_NAME_LENGTH,
  type EmoticonPackType,
} from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { BottomSheet, EmptyState, HapticTarget, Skeleton } from "@/shared/ui";
import { josa } from "es-hangul";
import { Search, Smile } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { usePackBrowse } from "../model/use-pack-browse";
import { EmoticonPackThumbnail } from "./emoticon-pack-thumbnail";

export type EmoticonPackPickerSheetProps = {
  className?: string;
  /** REQUIREMENTS.md § 13. Which library the sheet lists. */
  type: EmoticonPackType;
  isOpen: boolean;
  onClose: () => void;
  onPick: (pack: EmoticonPackSummary) => void;
};

// INFO: The sentinel's `rootMargin` and `usePackBrowse`'s own reach, matching `EmoticonPackBrowser`'s figure.
const SENTINEL_REACH = 600;

const NO_ENABLED_CHANGE = () => {};

/**
 * REQUIREMENTS.md § 13.4. Every pack of one kind, picked from rather than managed —
 * reached from 사진 사용하기's 이모티콘/미니이모티콘으로 추가하기 rows.
 *
 * INFO: `usePackBrowse` is § 13.5.'s own hook, reused for the same paged, searched
 * library; `onEnabledChange` is a no-op here since picking never flips a switch.
 *
 * WARN: A plain list rather than `EmoticonPackBrowser`'s `useWindowVirtualizer` — this
 * scrolls inside the sheet's own body, never the document (`AGENTS.md § 3.3.`).
 */
export function EmoticonPackPickerSheet({
  className,
  type,
  isOpen,
  onClose,
  onPick,
}: EmoticonPackPickerSheetProps) {
  const [query, setQuery] = useState("");
  const [scrollElement, setScrollElement] = useState<Nullable<HTMLElement>>(null);
  const packNoun = EMOTICON_KIND_NOUNS[type].pack;
  const { packs, isPending, isLoadingMore, hasFailed, loadMore } = usePackBrowse(
    type,
    query,
    NO_ENABLED_CHANGE,
  );
  const { ref: observeSentinel, inView } = useInView({
    root: scrollElement,
    rootMargin: `${SENTINEL_REACH}px`,
  });
  const sentinelRef = useRef<Nullable<HTMLDivElement>>(null);
  const setSentinel = useCallback(
    (node: Nullable<HTMLDivElement>) => {
      sentinelRef.current = node;
      observeSentinel(node);
    },
    [observeSentinel],
  );

  // WARN: `EmoticonPackBrowser`'s two WARNs apply verbatim — a landed page re-runs this on a stale `inView`, and the measurement is what stops it walking the whole library.
  useEffect(() => {
    if (inView && isSentinelInReach()) {
      loadMore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `isSentinelInReach` is redeclared per render; it measures, and a page landing is what should trigger it.
  }, [inView, isLoadingMore, loadMore]);

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      isTall
      keepsHeightUnderKeyboard
      scrollRef={setScrollElement}
      header={{ title: `${packNoun} 선택` }}
      onClose={onClose}
    >
      <div className="space-y-sm pt-2xs">
        <div className="flex h-11 items-center gap-2xs rounded-full border border-hairline bg-surface-soft px-sm">
          <Search className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} aria-hidden />
          <input
            className="min-w-0 flex-1 bg-transparent text-body-md text-ink outline-none selection:bg-primary-tint placeholder:text-meta-soft"
            maxLength={MAX_EMOTICON_PACK_NAME_LENGTH}
            enterKeyHint="search"
            type="text"
            value={query}
            placeholder={`${packNoun} 이름 검색`}
            aria-label={`${packNoun} 이름 검색`}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {renderList()}
      </div>
    </BottomSheet>
  );

  function isSentinelInReach() {
    const sentinel = sentinelRef.current;

    if (!sentinel || !scrollElement) {
      return false;
    }

    return (
      sentinel.getBoundingClientRect().top - scrollElement.getBoundingClientRect().bottom <=
      SENTINEL_REACH
    );
  }

  function renderList() {
    if (isPending) {
      return (
        <div aria-hidden>
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-sm py-xs">
              <Skeleton className="size-11 shrink-0 rounded-sm" />
              <Skeleton className="h-4 flex-1 rounded-xs" />
            </div>
          ))}
        </div>
      );
    }

    if (hasFailed) {
      return (
        <EmptyState Icon={Smile} description={`${josa(packNoun, "을/를")} 불러오지 못했어요`} />
      );
    }

    if (packs.length === 0) {
      return (
        <EmptyState
          Icon={Smile}
          description={
            query.trim().length > 0
              ? "검색 결과가 없어요"
              : `아직 ${josa(packNoun, "이/가")} 없어요`
          }
        />
      );
    }

    return (
      <>
        {packs.map((pack) => (
          <HapticTarget
            key={pack.id}
            className="flex w-full"
            overlayClassName="touch-pan-y"
            keepsScroll
          >
            <button
              className={cn(
                "flex w-full items-center gap-sm rounded-sm px-2xs py-xs text-left",
                "group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong",
              )}
              type="button"
              onClick={() => onPick(pack)}
            >
              <EmoticonPackThumbnail pack={pack} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-title-md text-ink">{pack.name}</span>
                <span className="block text-body-sm text-meta">{pack.itemCount}개</span>
              </span>
            </button>
          </HapticTarget>
        ))}
        <div ref={setSentinel} aria-hidden>
          {isLoadingMore && (
            <div className="flex items-center gap-sm py-xs">
              <Skeleton className="size-11 shrink-0 rounded-sm" />
              <Skeleton className="h-4 flex-1 rounded-xs" />
            </div>
          )}
        </div>
      </>
    );
  }
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"];
