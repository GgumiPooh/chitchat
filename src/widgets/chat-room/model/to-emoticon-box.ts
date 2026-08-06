import type { Emoticon } from "@/entities/emoticon";

// INFO: DESIGN.md § 6.5. The emoticon renders at its own aspect ratio inside this square ceiling, never cropped to it.
const MAX_EDGE = 140;

export type EmoticonBox = {
  width: number;
  height: number;
};

/**
 * DESIGN.md § 6.5. The box an emoticon bubble occupies, fitted inside the § 6.5.
 * ceiling.
 *
 * INFO: Shared with REQUIREMENTS.md § 8.3.'s row estimate rather than kept beside the bubble — an emoticon's height is knowable before it renders, and the estimate is only worth anything if it is the same arithmetic the bubble is drawn at.
 */
export function toEmoticonBox({ width, height }: Emoticon): EmoticonBox {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
