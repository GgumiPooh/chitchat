"use client";

import { toEmoticonAssetUrl, toMediaUrl, type QuoteThumbnail } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { Trash2 } from "lucide-react";

export type QuoteThumbnailTileProps = {
  className?: string;
  thumbnail: QuoteThumbnail;
};

/**
 * WARN: One 32px box for every kind, and `QUOTE_THUMBNAIL` prices exactly that
 * one — a margin, a padding or a border on any of them would have to be added
 * to the `REQUIREMENTS.md § 8.3.` estimate as well.
 *
 * INFO: DESIGN.md § 6.10.'s ring and radius frame a photograph, which fills its
 * box. Emoticon art is transparent-background and non-square (§ 13.2.), so it
 * is fitted rather than cropped and takes neither.
 */
export function QuoteThumbnailTile({ className, thumbnail }: QuoteThumbnailTileProps) {
  // INFO: REQUIREMENTS.md § 10. The icon alone — at 32px there is no room for the sentence `MediaTombstone` draws, and the summary line beside it already names what the message was.
  if (thumbnail.kind === "deleted") {
    return (
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xs bg-surface-soft ring-1 ring-hairline ring-inset",
          className,
        )}
        aria-hidden
      >
        <Trash2 className="size-4 text-meta-soft" strokeWidth={1.75} />
      </span>
    );
  }

  if (thumbnail.kind === "emoticon") {
    return (
      // WARN: `hasSkeleton={false}` for the reason the ring is off. `Skeleton` is an opaque `surface-strong` square, so the tile that refuses to frame transparent art would otherwise draw exactly that frame for as long as the asset takes to decode.
      <PreloadImage
        className={cn("size-8 shrink-0", className)}
        imgClassName="size-full object-contain"
        src={toEmoticonAssetUrl(thumbnail.itemId, "still-image", thumbnail.version)}
        hasSkeleton={false}
        alt=""
      />
    );
  }

  if (thumbnail.kind === "link") {
    return (
      // WARN: `canRetry` off and `no-referrer` as the § 6.9. card sets them — this is the same third-party image, on a host we do not own (REQUIREMENTS.md § 8.9.).
      <PreloadImage
        className={cn("size-8 shrink-0 overflow-hidden rounded-xs", className)}
        imgClassName="size-full object-cover ring-1 ring-hairline ring-inset"
        src={thumbnail.imageUrl}
        alt=""
        referrerPolicy="no-referrer"
        canRetry={false}
      />
    );
  }

  return (
    <PreloadImage
      className={cn("size-8 shrink-0 overflow-hidden rounded-xs", className)}
      imgClassName="size-full object-cover ring-1 ring-hairline ring-inset"
      src={toMediaUrl(thumbnail.mediaId)}
      alt=""
    />
  );
}
