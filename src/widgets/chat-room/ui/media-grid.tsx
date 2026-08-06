"use client";

import { cn, formatDuration } from "@/shared/lib";
import { PreloadImage, type MediaCell } from "@/shared/ui";
import { Play } from "lucide-react";
import { MEDIA_EDGE_REM, toMediaColumns } from "../model/to-media-box";

const MAX_EDGE = `${MEDIA_EDGE_REM}rem`;

export type MediaGridProps = {
  className?: string;
  cells: MediaCell[];
  /** `0`–`1` while the bubble uploads; `1` once every byte has landed. */
  progress?: number;
  isPending?: boolean;
  onOpen?: (index: number) => void;
};

// INFO: REQUIREMENTS.md § 8.1. Branch on count alone — one keeps its own aspect ratio, two or more take a fixed square-cell grid whose height follows from the layout rather than from the images.
export function MediaGrid({
  className,
  cells,
  progress = 1,
  isPending = false,
  onOpen,
}: MediaGridProps) {
  if (cells.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-md", isPending && "opacity-60", className)}
      style={{ width: MAX_EDGE }}
    >
      {cells.length === 1 ? renderSingle(cells[0]) : renderGrid()}
      {isPending && progress < 1 && (
        // INFO: The one progress affordance in the chat column. DESIGN.md § 6.5. dims an optimistic bubble rather than spinning it, so this reads as the dimmed bubble filling in.
        <div className="absolute inset-x-0 bottom-0 h-1 bg-scrim/45">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );

  function renderSingle(cell: MediaCell) {
    return (
      <button
        className="block w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
        type="button"
        aria-label={cell.isVideo ? "동영상 보기" : "사진 보기"}
        onClick={() => onOpen?.(0)}
      >
        {/* WARN: REQUIREMENTS.md § 8.3. The ratio is what reserves the row's height before the asset loads; without it every image that arrives re-measures the list and jolts the scroll. */}
        <span
          className="relative block w-full ring-1 ring-hairline ring-inset"
          style={{ aspectRatio: `${cell.width} / ${cell.height}` }}
        >
          <PreloadImage
            className="size-full"
            imgClassName="size-full object-cover"
            src={cell.previewUrl}
            alt=""
            // WARN: DESIGN.md § 3.2. Without it the hold on a bubble starts iOS's own image drag before the § 8.11. sheet can open.
            draggable={false}
          />
          {renderVideoOverlay(cell)}
        </span>
      </button>
    );
  }

  function renderGrid() {
    return (
      <div className={cn("grid gap-2xs", toColumnsClassName(cells.length))}>
        {cells.map((cell, index) => (
          <button
            key={cell.id}
            className="relative aspect-square cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            type="button"
            aria-label={cell.isVideo ? "동영상 보기" : "사진 보기"}
            onClick={() => onOpen?.(index)}
          >
            <PreloadImage
              className="size-full"
              imgClassName="size-full object-cover ring-1 ring-hairline ring-inset"
              src={cell.previewUrl}
              alt=""
              draggable={false}
            />
            {renderVideoOverlay(cell)}
          </button>
        ))}
      </div>
    );
  }

  function renderVideoOverlay(cell: MediaCell) {
    if (!cell.isVideo) {
      return null;
    }

    return (
      <>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-scrim/45">
            <Play className="size-4 text-on-primary" strokeWidth={2} />
          </span>
        </span>
        {cell.durationMs !== null && (
          <span className="absolute right-1 bottom-1 rounded-xs bg-scrim/45 px-1 py-0.5 text-micro text-on-primary">
            {formatDuration(cell.durationMs)}
          </span>
        )}
      </>
    );
  }
}

// WARN: The two literals stay literals — Tailwind scans for whole class names, and a template built from the column count generates neither.
function toColumnsClassName(count: number): string {
  return toMediaColumns(count) === 2 ? "grid-cols-2" : "grid-cols-3";
}
