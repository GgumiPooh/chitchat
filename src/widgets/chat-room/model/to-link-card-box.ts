import type { LinkPreview } from "@/entities/link-preview";

// INFO: DESIGN.md § 6.9. The thumbnail's default, and what a probe that read nothing falls back to — the shape every video site publishes.
const DEFAULT_RATIO = 16 / 9;

// INFO: DESIGN.md § 6.9. The frame is clamped between a video's landscape and Instagram's portrait post; a banner or an infographic is cropped to the nearer bound rather than stretching the column.
const MAX_RATIO = 16 / 9;
const MIN_RATIO = 4 / 5;

/**
 * DESIGN.md § 6.9. The `aspect-ratio` a card's thumbnail reserves, from the stored box.
 *
 * WARN: REQUIREMENTS.md § 8.3. The card and `estimateRowHeight` MUST both read it from
 * here — the frame is reserved before the image arrives, and two answers to its shape
 * are a row that grows under the reader.
 */
export function toLinkCardRatio({
  imageWidth,
  imageHeight,
}: Pick<LinkPreview, "imageWidth" | "imageHeight">): number {
  if (!imageWidth || !imageHeight) {
    return DEFAULT_RATIO;
  }

  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, imageWidth / imageHeight));
}
