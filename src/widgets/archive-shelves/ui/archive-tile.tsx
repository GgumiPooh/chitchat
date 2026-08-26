"use client";

import {
  LONG_PRESS_TARGET_CLASS,
  cn,
  formatDuration,
  useLongPress,
  type LongPressPoint,
  type MediaId,
  type Nullable,
} from "@/shared/lib";
import { PreloadImage, PrivateRing, toCellRatio, type MediaCell } from "@/shared/ui";
import { Check, Play } from "lucide-react";
import { ARCHIVE_TILE_ID_ATTRIBUTE } from "../model/use-archive-sweep";

/**
 * DESIGN.md § 4.7.3. The square a media id is currently drawn in, for the viewer to
 * collapse back into.
 *
 * WARN: The `button` inside the marked wrapper, not the wrapper itself — that is the box the opening morph left from (`onActivate` hands `event.currentTarget`), and a return journey that landed on a different rectangle would end with the photo snapping by a pixel or two.
 * INFO: Answers `null` for most of the library, and that is the normal case rather than a failure: REQUIREMENTS.md § 8.3. windows the grid on lines, so a reader who swiped the § 8.1. track a long way has no node for the slide they end on. `endMediaMorph` reads an off-screen one the same way.
 */
export function findArchiveTile(mediaId: MediaId): Nullable<HTMLElement> {
  return document.querySelector<HTMLElement>(
    `[${ARCHIVE_TILE_ID_ATTRIBUTE}="${CSS.escape(mediaId)}"] button`,
  );
}

/**
 * DESIGN.md § 4.7.3. Whether that tile is drawn **and inside the viewport** — the
 * question the shelf asks before moving itself to bring one into reach.
 *
 * WARN: Rendered is not enough. The grid overscans well past the fold for the § 10. sweep, so a tile can have a perfectly good node several screens away — scrolled to anyway, the shelf moves under a reader who could already see the one they were looking at.
 */
export function isTileOnScreen(mediaId: MediaId): boolean {
  const box = findArchiveTile(mediaId)?.getBoundingClientRect();

  return box !== undefined && box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
}

export type ArchiveTileProps = {
  className?: string;
  cell: MediaCell;
  isSelecting: boolean;
  isSelected: boolean;
  /** DESIGN.md § 6.8., § 7.10. This is the tile a § 10. position jump landed on, for as long as the flash runs. */
  isFlashing?: boolean;
  /**
   * Opens the viewer on this tile, or picks it while a selection is up.
   *
   * INFO: DESIGN.md § 4.7.3. Handed the square the reader tapped, because that box is where the viewer's slide expands *from* — `startMediaMorph` names it and the browser captures it. Read off the event rather than a ref, so the grid keeps one node per tile and no ref map to hold them in.
   */
  onActivate: (origin: HTMLElement) => void;
  /** REQUIREMENTS.md § 10. Picks this tile and anchors the sweep where the hold fired; the header control is the pointer equivalent. */
  onLongPress?: (point: LongPressPoint) => void;
};

/** DESIGN.md § 7.10. A square `object-cover` cell — the grid decides its size. */
export function ArchiveTile({
  className,
  cell,
  isSelecting,
  isSelected,
  isFlashing,
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
        onClick={(event) => onActivate(event.currentTarget)}
      >
        <PreloadImage
          className="size-full"
          imgClassName={cn(
            "size-full object-cover ring-1 ring-hairline transition-[scale] ring-inset",
            // INFO: The tile shrinks rather than dimming — a dim on a photograph reads as the photo being wrong, while the inset makes the selection ring the thing that changed.
            isSelected && "scale-90",
          )}
          src={cell.previewUrl}
          blurhash={cell.blurhash}
          // WARN: DESIGN.md § 7.8. The tile is square and the photo rarely is, so without the stored ratio the blur paints the whole picture squashed into the cell and the reveal re-frames it. The `object-cover` above is the rule this hands the placeholder.
          blurhashRatio={toCellRatio(cell)}
          alt=""
          // WARN: DESIGN.md § 3.2. Without it the hold starts iOS's own image drag and the selection never arms.
          draggable={false}
        />
        {/* WARN: REQUIREMENTS.md § 16.1. `PrivateRing`, not a ring class on `imgClassName` — a replaced element's own decoded content paints over its own inset box-shadow the same way a same-size child does (confirmed empirically; see the component's own doc). */}
        {cell.onlyMe && <PrivateRing className="rounded-sm" />}
        {/* INFO: DESIGN.md § 6.8. A ring rather than the bubble flash's `message-flash` wash — a photograph fills the cell, so nothing behind it is visible, and DESIGN.md § 7.10. rules out dimming one. */}
        {/* WARN: A sibling **above** the image, and mounted whether or not it is lit. An inset ring on the button paints under its own children, so the photograph covers it outright; and unmounting it on expiry would cut the fade rather than run it. */}
        <span
          className={cn(
            "pointer-events-none absolute inset-0 rounded-sm opacity-0 ring-2 ring-primary transition-opacity duration-300 ring-inset",
            isFlashing && "opacity-100",
          )}
          aria-hidden
        />
        {cell.isVideo && (
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
