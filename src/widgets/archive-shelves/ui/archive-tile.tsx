"use client";

import {
  LONG_PRESS_TARGET_CLASS,
  cn,
  formatDuration,
  useLongPress,
  type LongPressPoint,
} from "@/shared/lib";
import { PreloadImage, type MediaCell } from "@/shared/ui";
import { Check, Play } from "lucide-react";
import { ARCHIVE_TILE_ID_ATTRIBUTE } from "../model/use-archive-sweep";

export type ArchiveTileProps = {
  className?: string;
  cell: MediaCell;
  isSelecting: boolean;
  isSelected: boolean;
  onActivate: () => void;
  /** REQUIREMENTS.md § 10. Picks this tile and anchors the sweep where the hold fired; the header control is the pointer equivalent. */
  onLongPress?: (point: LongPressPoint) => void;
};

/** DESIGN.md § 7.10. A square `object-cover` cell — the grid decides its size. */
export function ArchiveTile({
  className,
  cell,
  isSelecting,
  isSelected,
  onActivate,
  onLongPress,
}: ArchiveTileProps) {
  // INFO: DESIGN.md § 3.2. No `contextmenu` half — the header's 선택 control is this gesture's pointer equivalent, so right-click keeps the browser's own image menu.
  const longPressHandlers = useLongPress(onLongPress, { withContextMenu: false });

  return (
    // WARN: A wrapper rather than the handlers on the button itself. `onClickCapture` is what stops the hold's release from also toggling the tile it just selected, and it only reaches a target it sits above.
    <div
      className={cn("relative", LONG_PRESS_TARGET_CLASS, className)}
      // INFO: What the sweep of REQUIREMENTS.md § 10. hit-tests for — the drag hears no event of this tile's own, since the finger that owns it went down on another one.
      {...{ [ARCHIVE_TILE_ID_ATTRIBUTE]: cell.id }}
      {...longPressHandlers}
    >
      <button
        className="relative block aspect-square w-full cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
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
          // WARN: DESIGN.md § 3.2. Without it the hold starts iOS's own image drag and the selection never arms.
          draggable={false}
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
    </div>
  );
}
