"use client";

import { cn, formatDuration } from "@/shared/lib";
import { PreloadImage, type MediaCell } from "@/shared/ui";
import { Check, Play } from "lucide-react";

export type GalleryTileProps = {
  className?: string;
  cell: MediaCell;
  isSelecting: boolean;
  isSelected: boolean;
  onActivate: () => void;
};

/** DESIGN.md § 7.10. A square `object-cover` cell — the grid decides its size. */
export function GalleryTile({
  className,
  cell,
  isSelecting,
  isSelected,
  onActivate,
}: GalleryTileProps) {
  return (
    <button
      className={cn(
        "relative aspect-square cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
        className,
      )}
      type="button"
      aria-label={cell.isVideo ? "동영상" : "사진"}
      aria-pressed={isSelecting ? isSelected : undefined}
      onClick={onActivate}
    >
      <PreloadImage
        className="size-full"
        imgClassName={cn(
          "size-full object-cover ring-1 ring-hairline transition-[scale] ring-inset",
          // INFO: The tile shrinks rather than dimming — a dim on a photograph reads as the photo being wrong, while the inset makes the selection ring the thing that changed.
          isSelected && "scale-90",
        )}
        src={cell.previewUrl}
        alt=""
      />
      {cell.isVideo && (
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
      )}
      {isSelecting && (
        <span
          className={cn(
            "absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full border transition-colors",
            isSelected
              ? "border-primary bg-primary"
              : "border-canvas/80 bg-scrim/25 backdrop-blur-xs",
          )}
        >
          {isSelected && <Check className="size-3.5 text-on-primary" strokeWidth={3} />}
        </span>
      )}
    </button>
  );
}
