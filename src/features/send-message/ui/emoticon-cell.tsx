"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  MINI_ANIMATION_LOOP_INTERVAL,
  toPreviousReplaySrc,
  toReplaySrc,
  useViewportReplay,
} from "@/shared/lib";
import { HapticTarget, PreloadImage } from "@/shared/ui";
import type { MouseEvent } from "react";
import { FOCUS_INDEX_ATTRIBUTE } from "../model/emoticon-focus";

/**
 * REQUIREMENTS.md § 8.14. The focus ring, on plain `:focus`, for as long as this panel
 * is being driven by the keyboard.
 */
export const CELL_KEYBOARD_RING =
  "focus:bg-primary-tint focus:ring-2 focus:ring-primary focus:ring-inset focus:outline-none";

export type EmoticonCellProps = {
  className?: string;
  buttonClassName?: string;
  item: Emoticon;
  /** REQUIREMENTS.md § 8.14. This cell's place in the list its scroller holds, which is what the arrow keys step through. */
  index: number;
  /** REQUIREMENTS.md § 8.14. Whether this is the one cell of the list in the tab sequence (ARIA's roving tabindex). */
  isFocusable: boolean;
  /** § 13.6. Whether this list is one the warm covers, which decides how its images load. */
  isWarmed?: boolean;
  /** § 13.6. How many cells from the head load `eager`, which widens as the tab's own warm lands. Ignored unless `isWarmed`. */
  eagerCount?: number;
  /** REQUIREMENTS.md § 8.14. Whether the panel is being driven by the keyboard, which is what puts the ring on plain `:focus` (`CELL_KEYBOARD_RING`). */
  isKeyboardDriven: boolean;
  /** REQUIREMENTS.md § 13.9. Whether this is the cell 따라하기 named, which is ringed until the panel is taken somewhere else. */
  isRevealed?: boolean;
  /** REQUIREMENTS.md § 13. A mini draws its `animated-image` slot, not `still-image`. */
  isMini?: boolean;
  onSelect: (item: Emoticon) => void;
  onFocusCell?: (index: number) => void;
};

/** INFO: § 13.6. The grid and § 13.8.'s results draw the same cell — only the box around it differs. */
export function EmoticonCell({
  className,
  buttonClassName,
  item,
  index,
  isFocusable,
  isWarmed = false,
  eagerCount = 0,
  isKeyboardDriven,
  isRevealed = false,
  isMini = false,
  onSelect,
  onFocusCell,
}: EmoticonCellProps) {
  // WARN: § 13. A GIF/WebP/APNG's own loop count is not always infinite, so a mini cell fakes forever by remounting on a timer while it is actually on screen — `MINI_ANIMATION_LOOP_INTERVAL`.
  const { ref: replayRef, replayToken } = useViewportReplay(
    isMini ? MINI_ANIMATION_LOOP_INTERVAL : undefined,
  );
  const emoticonAssetUrl = toEmoticonAssetUrl(
    item.id,
    isMini ? "animated-image" : "still-image",
    item.version,
  );

  return (
    // WARN: `touch-pan-x touch-pan-y` is repeated on the overlay rather than inherited — `touch-action` applies to the element the gesture starts on, and a cell tiles its scroller. The two are intersected (`DESIGN.md § 7.15.1.`), so a pair that disagreed would resolve to `none` and the panel would not scroll at all. Both axes are enabled so horizontal swipes bubble to the CSS snap track while vertical swipes scroll the tab pane.
    // WARN: `keepsScroll` is mandatory on a cell that tiles — the switch itself would keep the drag and the panel would stop scrolling (`DESIGN.md § 7.15.`).
    // WARN: § 13. `min-h-0`/`min-w-0` on both boxes, or a narrow pane stops drawing squares: an `<img>` with no width/height attributes contributes its **natural pixel size** to a flex/grid item's automatic minimum, and an asset taller than the column it is drawn in floors the whole row above `square-cell`.
    <HapticTarget
      className={cn("min-h-0 min-w-0", className)}
      overlayClassName="touch-pan-x touch-pan-y"
      keepsScroll
    >
      {/* WARN: A press held on an emoticon is the start of the § 13.6. swipe, but to WebKit it is a long-press on an image — the callout it raises takes the pointer stream with it. */}
      <button
        ref={isMini ? replayRef : undefined}
        className={cn(
          "touch-pan-x touch-pan-y",
          "min-h-0 min-w-0 rounded-sm p-2xs transition-colors select-none [-webkit-touch-callout:none] group-active:bg-surface-strong hover:bg-surface-soft focus-visible:bg-primary-tint focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset active:bg-surface-strong",
          isKeyboardDriven && CELL_KEYBOARD_RING,
          isRevealed && "ring-2 ring-primary ring-inset",
          buttonClassName,
        )}
        type="button"
        tabIndex={isFocusable ? 0 : -1}
        aria-label={item.keywords.length > 0 ? item.keywords.join(", ") : "이모티콘"}
        {...{ [FOCUS_INDEX_ATTRIBUTE]: index }}
        onClick={(event) => {
          takeFocus(event);
          onFocusCell?.(index);
          onSelect(item);
        }}
      >
        <PreloadImage
          key={replayToken}
          className="size-full"
          imgClassName="size-full object-contain"
          placeholderClassName="rounded-sm"
          alt=""
          previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
          hidesPreviewOnReveal
          hasDeferredSkeleton={isWarmed}
          loading={(isWarmed && index < eagerCount) || replayToken > 0 ? "eager" : "lazy"}
          draggable={false}
          src={toReplaySrc(emoticonAssetUrl, replayToken)}
        />
      </button>
    </HapticTarget>
  );
}

/**
 * Defers focus to pointerup / click, avoiding scroll jumps during touch events on mobile WebKit.
 */
export function takeFocus(event: MouseEvent<HTMLButtonElement>): void {
  if (
    ("pointerType" in event.nativeEvent &&
      (event.nativeEvent as PointerEvent).pointerType === "touch") ||
    (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches)
  ) {
    return;
  }

  event.currentTarget.focus({ preventScroll: true });
}
