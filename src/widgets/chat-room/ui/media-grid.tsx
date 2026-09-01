"use client";

import { cn, formatDuration, type MediaId, type Nullable } from "@/shared/lib";
import {
  FileCard,
  MediaTombstone,
  PreloadImage,
  PrivateRing,
  SilentRing,
  toCellRatio,
  type MediaCell,
} from "@/shared/ui";
import { Play } from "lucide-react";
import { MEDIA_EDGE_REM, toMediaColumns } from "../model/to-media-box";

const MAX_EDGE = `${MEDIA_EDGE_REM}rem`;

/** DESIGN.md § 4.7.3. The viewer's closing morph has to find the cell it came from, and a bubble is windowed out of the DOM long before the § 8.1. track runs out — so the id is readable off the element rather than held as a ref. */
const CELL_ID_ATTRIBUTE = "data-chat-media-id";

/**
 * DESIGN.md § 4.7.3. The cell a media id is currently drawn in, for the viewer to
 * collapse back into.
 *
 * INFO: Answers `null` for most of a conversation, and that is the normal case rather than a failure: REQUIREMENTS.md § 8.3. windows the room on rows, and § 8.1.'s track crosses bubbles that were never on screen. `endMediaMorph` reads an off-screen one the same way.
 */
export function findChatMediaCell(mediaId: MediaId): Nullable<HTMLElement> {
  return document.querySelector<HTMLElement>(`[${CELL_ID_ATTRIBUTE}="${CSS.escape(mediaId)}"]`);
}

export type MediaGridProps = {
  className?: string;
  cells: MediaCell[];
  /** `0`–`1` while the bubble uploads; `1` once every byte has landed. */
  progress?: number;
  isPending?: boolean;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — rings every tile/card rather than recolouring, since none of these has a fill of its own to swap. */
  isOnlyMe?: boolean;
  /** REQUIREMENTS.md § 16.1. 조용히 보내기 — a dashed `SilentRing` per tile and the file card's dashed border, on the ring's own terms. */
  isSilent?: boolean;
  /** DESIGN.md § 6.5.1. The cell currently re-encoding, paired with `encodeProgress`. `null` outside that phase, e.g. once its upload has started or for a bubble of stills, which never encode. */
  encodingIndex?: Nullable<number>;
  /** `0`–`1` for the cell at `encodingIndex`. Ignored unless that index is set. */
  encodeProgress?: Nullable<number>;
  /**
   * INFO: DESIGN.md § 4.7.3. `origin` is the cell's own box, which the viewer's opening morph expands out of. A file card passes none — it saves rather than opening a viewer.
   */
  onOpen?: (index: number, origin?: HTMLElement) => void;
};

// INFO: REQUIREMENTS.md § 8.1. Branch on count alone — one keeps its own aspect ratio, two or more take a fixed square-cell grid whose height follows from the layout rather than from the images.
export function MediaGrid({
  className,
  cells,
  progress = 1,
  isPending = false,
  isOnlyMe = false,
  isSilent = false,
  encodingIndex = null,
  encodeProgress = null,
  onOpen,
}: MediaGridProps) {
  if (cells.length === 0) {
    return null;
  }

  // WARN: The wrapper's clip radius must equal what its corner cells draw — `rounded-md` over a `rounded-sm` grid cut diagonally through the tiles' outer corners (and § 16.1.'s ring), since a 12px arc reaches ~1px deeper into the corner than the 8px arc the cell painted.
  const isTileGrid = !cells[0].filename && cells.length > 1;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        isTileGrid ? "rounded-sm" : "rounded-md",
        isPending && "opacity-60",
        className,
      )}
      style={{ width: MAX_EDGE }}
    >
      {renderCells()}
      {isPending && progress < 1 && encodeProgress === null && (
        // INFO: The one progress affordance in the chat column. DESIGN.md § 6.5. dims an optimistic bubble rather than spinning it, so this reads as the dimmed bubble filling in.
        // INFO: DESIGN.md § 6.5.1. Withheld while `encodeProgress` is set — the centred percentage over the encoding cell is the phase's own indicator, and the byte bar would otherwise sit at 0% beside it.
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
            // INFO: The finished restructure. `FILE_CARD_HEIGHT`'s own `h-14`, so the stack measures the same whether the card is a file or a tombstone (REQUIREMENTS.md § 8.3.).
            <MediaTombstone key={cell.id} className="h-14 flex-row" cell={cell} />
          ) : (
            <FileCard
              key={cell.id}
              filename={cell.filename ?? ""}
              sizeBytes={cell.sizeBytes}
              // INFO: A draft has no stored object yet, so the card is inert until the upload registers one.
              disabled={cell.downloadUrl === null}
              isOnlyMe={isOnlyMe}
              isSilent={isSilent}
              aria-label={`${cell.filename} 저장`}
              onClick={() => onOpen?.(index)}
            />
          ),
        )}
      </div>
    );
  }

  function renderSingle(cell: MediaCell) {
    // INFO: The finished restructure. Not a button — there is nothing behind it to open — but it keeps the ratio, so the row is exactly as tall as it was before the delete.
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
        {...{ [CELL_ID_ATTRIBUTE]: cell.id }}
        onClick={(event) => onOpen?.(0, event.currentTarget)}
      >
        {/* WARN: REQUIREMENTS.md § 8.3. The ratio is what reserves the row's height before the asset loads; without it every image that arrives re-measures the list and jolts the scroll. */}
        <span
          className={cn("relative block w-full", !isOnlyMe && "ring-1 ring-hairline ring-inset")}
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
          {renderVideoOverlay(cell, 0)}
          {/* WARN: REQUIREMENTS.md § 16.1. `PrivateRing`, not a ring class on this span — `PreloadImage` fills the span exactly, so an inset ring here paints under it, and an outward one is clipped by the outer wrapper's `overflow-hidden`. */}
          {/* WARN: `rounded-md` matches the outer wrapper's own radius — `PrivateRing`'s box-shadow follows its own border-box, not the ancestor's, so left sharp it draws square corners inside the rounded clip. */}
          {isOnlyMe && <PrivateRing className="rounded-md" />}
          {isSilent && <SilentRing className="rounded-md" />}
        </span>
      </button>
    );
  }

  function renderGrid() {
    return (
      <div className={cn("grid gap-2xs", toColumnsClassName(cells.length))}>
        {cells.map((cell, index) =>
          cell.isDeleted ? (
            // WARN: The finished restructure. The cell stays in the grid rather than being filtered out of it. A bubble of three with one deleted draws two tiles and a tombstone; two tiles would silently rewrite what the other participant remembers seeing.
            // INFO: `overflow-hidden` is the backstop and not the plan — the column below is sized to fit, and `justify-center` means anything that did outgrow the tile would be clipped at *both* ends. The tile is `MEDIA_EDGE_REM`, so a reader's enlarged root size grows this box while the `px` type inside it stays put; the fit only ever gets looser.
            <div key={cell.id} className="aspect-square overflow-hidden rounded-sm">
              {/* WARN: Three columns leave the sentence a ~63px line, which `삭제된 동영상이에요` — the longest of them — wraps to three of. `micro`, `size-4` and `px-2xs` are what fit those three lines plus the icon inside a 70.7px tile; `caption` at `size-5` stands ~13px taller than the tile and is clipped. */}
              <MediaTombstone
                className="rounded-sm px-2xs"
                iconClassName="size-4"
                textClassName="text-micro"
                cell={cell}
              />
            </div>
          ) : (
            <button
              key={cell.id}
              className={cn(
                "relative aspect-square cursor-pointer overflow-hidden rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                !isOnlyMe && "ring-1 ring-hairline ring-inset",
              )}
              type="button"
              aria-label={cell.isVideo ? "동영상 보기" : "사진 보기"}
              {...{ [CELL_ID_ATTRIBUTE]: cell.id }}
              onClick={(event) => onOpen?.(index, event.currentTarget)}
            >
              <PreloadImage
                className="size-full"
                imgClassName="size-full object-cover"
                src={cell.previewUrl}
                blurhash={cell.blurhash}
                // WARN: DESIGN.md § 7.8. As 보관함's tile — these cells are square whatever shape the attachment is, so the blur needs the ratio to be cropped where the photo is.
                blurhashRatio={toCellRatio(cell)}
                alt=""
                draggable={false}
              />
              {renderVideoOverlay(cell, index)}
              {/* WARN: REQUIREMENTS.md § 16.1. `PrivateRing`, not a ring class on this button — `overflow-hidden` above clips this element's children, and `PreloadImage` fills the button exactly either way. */}
              {isOnlyMe && <PrivateRing className="rounded-sm" />}
              {isSilent && <SilentRing className="rounded-sm" />}
            </button>
          ),
        )}
      </div>
    );
  }

  function renderVideoOverlay(cell: MediaCell, index: number) {
    // WARN: Ahead of the `isVideo` gate, not inside it — an animated image re-encodes too (§ 9.), and gated on video it drew no indicator at all while the byte bar below stayed withheld.
    if (encodingIndex === index && encodeProgress !== null) {
      // INFO: DESIGN.md § 6.5.1. Replaces the play glyph rather than joining it — a draft mid-encode has nothing playable yet, and the two would otherwise compete for the same centre.
      return (
        <span className="absolute inset-0 flex items-center justify-center bg-scrim/45">
          <span className="text-title-md text-on-scrim">{Math.round(encodeProgress * 100)}%</span>
        </span>
      );
    }

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
