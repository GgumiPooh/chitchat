"use client";

import { cn, formatDuration } from "@/shared/lib";
import { FileCard, MediaTombstone, PreloadImage, toCellRatio, type MediaCell } from "@/shared/ui";
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
      {renderCells()}
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

  // INFO: REQUIREMENTS.md § 9.1. A bubble is files or photos, never both (§ 6.), so the first cell picks the layout for all of them.
  function renderCells() {
    if (cells[0].filename) {
      return renderFiles();
    }

    return cells.length === 1 ? renderSingle(cells[0]) : renderGrid();
  }

  // INFO: DESIGN.md § 6.5. The `FileCard` of `shared/ui`, stacked when a bubble carries several — the same row 보관함 lists (REQUIREMENTS.md § 10.).
  function renderFiles() {
    return (
      <div className="flex flex-col gap-2xs">
        {cells.map((cell, index) =>
          cell.isDeleted ? (
            // INFO: RESTRUCTURE.md § 4.3. `FILE_CARD_HEIGHT`'s own `h-14`, so the stack measures the same whether the card is a file or a tombstone (REQUIREMENTS.md § 8.3.).
            <MediaTombstone key={cell.id} className="h-14 flex-row" cell={cell} />
          ) : (
            <FileCard
              key={cell.id}
              filename={cell.filename ?? ""}
              sizeBytes={cell.sizeBytes}
              // INFO: A draft has no stored object yet, so the card is inert until the upload registers one.
              disabled={cell.downloadUrl === null}
              aria-label={`${cell.filename} 저장`}
              onClick={() => onOpen?.(index)}
            />
          ),
        )}
      </div>
    );
  }

  function renderSingle(cell: MediaCell) {
    // INFO: RESTRUCTURE.md § 4.3. Not a button — there is nothing behind it to open — but it keeps the ratio, so the row is exactly as tall as it was before the delete.
    if (cell.isDeleted) {
      return (
        <span className="block w-full" style={{ aspectRatio: toCellRatio(cell) }}>
          <MediaTombstone cell={cell} />
        </span>
      );
    }

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
          style={{ aspectRatio: toCellRatio(cell) }}
        >
          <PreloadImage
            className="size-full"
            imgClassName="size-full object-cover"
            src={cell.previewUrl}
            blurhash={cell.blurhash}
            blurhashRatio={toCellRatio(cell)}
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
        {cells.map((cell, index) =>
          cell.isDeleted ? (
            // WARN: RESTRUCTURE.md § 4.3. The cell stays in the grid rather than being filtered out of it. A bubble of three with one deleted draws two tiles and a tombstone; two tiles would silently rewrite what the other participant remembers seeing.
            <div key={cell.id} className="aspect-square">
              <MediaTombstone className="rounded-sm" cell={cell} />
            </div>
          ) : (
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
                blurhash={cell.blurhash}
                // WARN: DESIGN.md § 7.8. As 보관함's tile — these cells are square whatever shape the attachment is, so the blur needs the ratio to be cropped where the photo is.
                blurhashRatio={toCellRatio(cell)}
                alt=""
                draggable={false}
              />
              {renderVideoOverlay(cell)}
            </button>
          ),
        )}
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
            <Play className="size-4 text-on-scrim" strokeWidth={2} />
          </span>
        </span>
        {cell.durationMs !== null && (
          <span className="absolute right-1 bottom-1 rounded-xs bg-scrim/45 px-1 py-0.5 text-micro text-on-scrim">
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
