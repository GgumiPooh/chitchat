"use client";

import type { ArchiveMedia } from "@/entities/media";
import { toMediaUrl } from "@/shared/config";
import { formatDuration, useVoicePlayback } from "@/shared/lib";
import { FileCard } from "@/shared/ui";
import type { ReactNode } from "react";
import { AudioPlayButton } from "./audio-play-button";

export type ArchiveAudioRowProps = {
  className?: string;
  item: ArchiveMedia;
  isSelecting: boolean;
  isSelected: boolean;
  /** The selection mark the list draws for every 파일 row, passed in so the two rows cannot draw two different marks. */
  mark: ReactNode;
  onToggle: (id: string) => void;
  onDownload: (id: string) => void;
};

/**
 * REQUIREMENTS.md § 9.1. A 파일 row whose attachment is audio: the ordinary card,
 * with a play control in front of it.
 *
 * WARN: It is still a **file**, on the 파일 shelf, and `isOfShelf` is untouched. Its
 * `kind` is `file` (the finished restructure) whatever its mime says — what changed is
 * only that a file with no inline view now has one for the single type where an
 * inline view costs nothing to produce.
 *
 * WARN: Played through `shared/lib/audio`'s one shared element, never an `<audio>`
 * of its own. That element is what enforces one clip at a time across the app and
 * what carries § 13.6.'s audio-session decision; a second writer would undo both.
 */
export function ArchiveAudioRow({
  className,
  item,
  isSelecting,
  isSelected,
  mark,
  onToggle,
  onDownload,
}: ArchiveAudioRowProps) {
  const src = toMediaUrl(item.id, "original");
  // INFO: § 9.1. `validateMediaUpload` nulls `duration_ms` for a file, so there is nothing stored to pass — `useVoicePlayback` falls back to what the element resolves at `loadedmetadata`, which is exactly the figure this row can afford.
  const { isActive, isPlaying, positionMs, progress, resolvedDurationMs, toggle } =
    useVoicePlayback(src, 0);
  const filename = item.filename ?? "";

  return (
    <div className={className}>
      <div className="flex items-center gap-xs">
        <AudioPlayButton isPlaying={isPlaying} onToggle={toggle} />
        <FileCard
          className="min-w-0 flex-1"
          filename={filename}
          sizeBytes={item.size}
          isSelected={isSelected}
          trailing={isSelecting ? mark : undefined}
          // INFO: The clock replaces the size only once the track is the active one — an untouched row still says how big the file is, which is what a 저장 tap is judged on.
          meta={isActive ? toElapsedLabel(positionMs, resolvedDurationMs) : undefined}
          progress={isActive ? progress : undefined}
          aria-label={isSelecting ? filename : `${filename} 저장`}
          aria-pressed={isSelecting ? isSelected : undefined}
          onClick={() => (isSelecting ? onToggle(item.id) : onDownload(item.id))}
        />
      </div>
    </div>
  );
}

// INFO: `formatDuration` answers `0:00` for an unknown length, and "0:00 / 0:00" under a playing clip reads as broken — the elapsed figure alone is honest until the element reports a duration.
function toElapsedLabel(positionMs: number, durationMs: number): string {
  return durationMs > 0
    ? `${formatDuration(positionMs)} / ${formatDuration(durationMs)}`
    : formatDuration(positionMs);
}
