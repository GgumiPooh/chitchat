"use client";

import type { ArchiveMedia } from "@/entities/media";
import { toMediaUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Skeleton, VoicePlayer } from "@/shared/ui";
import { Check } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { toArchiveSections } from "../model/to-archive-sections";

export type ArchiveVoiceListProps = {
  className?: string;
  media: ArchiveMedia[];
  isLoadingMore: boolean;
  isSelecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onLoadMore: () => void;
};

/**
 * The 음성 segment of 보관함 (REQUIREMENTS.md § 10.) — the month sections the other
 * two shelves use, as a one-column list of `VoicePlayer` rows.
 *
 * INFO: A tap **plays**, where 사진 opens the viewer and 파일 downloads. That is the
 * rule the segments are cut along (§ 10.): one shelf, one thing a tap means.
 *
 * WARN: The player is the same component the chat bubble draws, so a recording is
 * the same object in both places rather than a second rendering of it — and only one
 * clip plays at a time here for free, since `shared/lib/audio` owns one element for
 * the whole page (§ 13.6.).
 */
export function ArchiveVoiceList({
  className,
  media,
  isLoadingMore,
  isSelecting,
  selected,
  onToggle,
  onLoadMore,
}: ArchiveVoiceListProps) {
  const sections = useMemo(() => toArchiveSections(media), [media]);
  const { ref: sentinelRef, inView } = useInView({ rootMargin: "600px" });

  // WARN: `isLoadingMore` is the dependency, not `media.length` — a page that deduplication empties leaves the length alone and would stall paging outright (§ 10.).
  useEffect(() => {
    if (inView) {
      onLoadMore();
    }
  }, [inView, isLoadingMore, onLoadMore]);

  return (
    <div className={cn("flex flex-col gap-md", className)}>
      {sections.map((section) => (
        <section key={section.monthKey}>
          {/* INFO: DESIGN.md § 7.10. Scrolls with the list, for the reason the grid's header does. */}
          <h2 className="pb-xs text-title-sm text-meta">{section.label}</h2>
          <div className="flex flex-col gap-2xs">
            {media
              .slice(section.startIndex, section.startIndex + section.count)
              .map((item) => renderRow(item))}
          </div>
        </section>
      ))}
      <div ref={sentinelRef} aria-hidden>
        {isLoadingMore && (
          <div className="flex flex-col gap-2xs">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-14 rounded-bubble" />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  /**
   * WARN: The selection mark is a sibling of the player, never a wrapper around it.
   * The player owns a play control and a seek slider of its own, and a row that
   * swallowed their taps in selection mode would leave both looking live and doing
   * nothing — so selecting is its own control beside them.
   */
  function renderRow(item: ArchiveMedia) {
    const isSelected = selected.has(item.id);

    return (
      <div key={item.id} className="flex items-center gap-xs">
        {isSelecting && renderMark(item.id, isSelected)}
        {/* INFO: `isMine` is false for every row. 보관함 is the shared shelf and a list of alternating fills reads as a conversation replayed out of order — DESIGN.md § 6.2.'s two colours answer "who said this" in a thread, which a month section does not ask. */}
        <VoicePlayer
          className="min-w-0 flex-1"
          src={toMediaUrl(item.id, "original")}
          durationMs={item.durationMs ?? 0}
          peaks={item.voice?.peaks ?? []}
          isMine={false}
        />
      </div>
    );
  }

  // INFO: DESIGN.md § 7.10.1. The 파일 list's mark, which is the grid's disc redrawn for a surface rather than for a photograph.
  function renderMark(id: string, isSelected: boolean) {
    return (
      <button
        className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
        type="button"
        aria-label="선택"
        aria-pressed={isSelected}
        onClick={() => onToggle(id)}
      >
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full border transition-colors",
            isSelected ? "border-primary bg-primary" : "border-hairline-strong bg-canvas",
          )}
        >
          {isSelected && <Check className="size-3.5 text-on-primary" strokeWidth={3} />}
        </span>
      </button>
    );
  }
}

// INFO: DESIGN.md § 7.8. One placeholder row per skeleton while the next page is in flight; more would claim a page size the response may not fill.
const SKELETON_KEYS = ["a", "b", "c"];
