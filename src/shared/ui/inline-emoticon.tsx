"use client";

import { toEmoticonAssetUrl } from "@/shared/config";
import { cn, type EmoticonItemId, type Nullable } from "@/shared/lib";
import { PreloadImage } from "./preload-image";

export type InlineEmoticonProps = {
  className?: string;
  imgClassName?: string;
  itemId: EmoticonItemId;
  /** REQUIREMENTS.md § 13.4. The item's `updated_at` in milliseconds — an edit keeps the id, so nothing else tells the cached redirect apart from the new object. */
  version: number;
  /** The asset's own pixels. Only their ratio is used: the box is one line tall whatever they are. */
  width: number;
  height: number;
  name?: Nullable<string>;
};

/**
 * An emoticon standing between the characters of a line — what one
 * `OBJECT_PLACEHOLDER` draws as (REQUIREMENTS.md § 6.).
 *
 * INFO: In `shared/ui` because the draft in the composer and the bubble it is sent as
 * must be the same box, and the two are written in different layers.
 *
 * WARN: One line tall (`1lh`) with the ratio doing the width, so nothing here has to
 * measure the line or wait for the asset — and the box is the same before and after
 * the image lands, which is what keeps a load from re-wrapping the text around it.
 *
 * WARN: `align-bottom`, never the default baseline and never `align-middle`. An
 * inline-block's baseline is its bottom margin edge, so a box on the baseline hangs
 * a whole descender below the line and grows every line box it lands in.
 */
export function InlineEmoticon({
  className,
  imgClassName,
  itemId,
  version,
  width,
  height,
  name,
}: InlineEmoticonProps) {
  return (
    <span
      className={cn("inline-block align-bottom", className)}
      style={{ height: "1lh", aspectRatio: `${width} / ${height}` }}
    >
      <PreloadImage
        className="size-full"
        // INFO: `object-contain`, since an emoticon is not square and a crop would cut the drawing rather than letterbox it.
        imgClassName={cn("size-full object-contain object-center", imgClassName)}
        // WARN: DESIGN.md § 7.8. Deferred, for the picker cells' reason — an emoticon in a draft was chosen from a panel that had already loaded it, so a skeleton at one line tall only ever flashes.
        hasDeferredSkeleton
        alt={name ?? ""}
        draggable={false}
        // INFO: The animated slot, which the asset route falls back from when the item holds only a still (REQUIREMENTS.md § 13.3.).
        src={toEmoticonAssetUrl(itemId, "animated-image", version)}
      />
    </span>
  );
}
