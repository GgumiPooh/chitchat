"use client";

import type { ArchiveMedia } from "@/entities/media";
import { isAudioMime } from "@/shared/config";
import { cn } from "@/shared/lib";
import { FileCard, Skeleton } from "@/shared/ui";
import { Check } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useInView } from "react-intersection-observer";
import { toArchiveSections, toMonthAnchorId } from "../model/to-archive-sections";
import { ArchiveAudioRow } from "./archive-audio-row";

export type ArchiveFileListProps = {
  className?: string;
  media: ArchiveMedia[];
  isLoadingMore: boolean;
  isSelecting: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  /** REQUIREMENTS.md § 9.1. A tap saves — a file is served as an attachment, so there is no viewer to open. */
  onDownload: (id: string) => void;
  onLoadMore: () => void;
};

/**
 * The 파일 segment of 보관함 (REQUIREMENTS.md § 10.) — the same month sections the
 * grid uses, as a one-column list of `FileCard` rows: a filename and a size truncate
 * three abreast in a 576px shell. No hold or sweep — a checkbox handles selection
 * since a one-column range is just two taps.
 */
export function ArchiveFileList({
  className,
  media,
  isLoadingMore,
  isSelecting,
  selected,
  onToggle,
  onDownload,
  onLoadMore,
}: ArchiveFileListProps) {
  // INFO: The same `ArchiveMedia` sections the grid builds — a file row carries an id like every other library row, so the month header needed no change at all.
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
        // INFO: AGENTS.md § 4.1. `id` + `scroll-mt` is what the `lg` panel's month list scrolls to — this shelf has no virtualizer to hand an index to.
        <section
          key={section.monthKey}
          className="scroll-mt-(--app-header-inset)"
          id={toMonthAnchorId(section.monthKey)}
        >
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
              <Skeleton key={key} className="h-14 rounded-md" />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  function renderRow(item: ArchiveMedia) {
    const isSelected = selected.has(item.id);
    const filename = item.filename ?? "";

    // INFO: REQUIREMENTS.md § 9.1. An audio attachment gets a play control beside the card; every other file keeps the row it always had, because there is nothing to play.
    if (isAudioMime(item.mime)) {
      return (
        <ArchiveAudioRow
          key={item.id}
          item={item}
          isSelecting={isSelecting}
          isSelected={isSelected}
          mark={renderMark(isSelected)}
          onToggle={onToggle}
          onDownload={onDownload}
        />
      );
    }

    return (
      <FileCard
        key={item.id}
        filename={filename}
        sizeBytes={item.size}
        isSelected={isSelected}
        trailing={isSelecting ? renderMark(isSelected) : undefined}
        aria-label={isSelecting ? filename : `${filename} 저장`}
        aria-pressed={isSelecting ? isSelected : undefined}
        onClick={() => (isSelecting ? onToggle(item.id) : onDownload(item.id))}
      />
    );
  }

  // INFO: DESIGN.md § 7.10.'s mark, on a surface rather than on a photograph — the grid's translucent disc exists to read over an image, and over `surface-soft` it only reads as smudged.
  function renderMark(isSelected: boolean) {
    return (
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          isSelected ? "border-primary bg-primary" : "border-hairline-strong bg-canvas",
        )}
      >
        {isSelected && <Check className="size-3.5 text-on-primary" strokeWidth={3} />}
      </span>
    );
  }
}

// INFO: DESIGN.md § 7.8. One placeholder row per skeleton while the next page is in flight; more would claim a page size the response may not fill.
const SKELETON_KEYS = ["a", "b", "c"];
