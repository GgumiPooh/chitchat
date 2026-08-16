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
 *
 * WARN: § 13. A lone inline emoticon takes this too, and the ceiling stays a **ceiling
 * rather than a target**: the scale is capped at 1, so a picture authored small draws at
 * its own pixels rather than being blown up to 140. That is already how a small
 * `emoticon`-kind item behaves, and a mini is authored to stand one line tall — upscaling
 * one to the ceiling is a guaranteed blur, and the same asset would then render at two
 * sizes depending on which pack it came from.
 */
export function toEmoticonBox({ width, height }: { width: number; height: number }): EmoticonBox {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
