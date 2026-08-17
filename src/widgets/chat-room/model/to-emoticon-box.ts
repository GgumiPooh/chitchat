// INFO: DESIGN.md § 6.5. The emoticon renders at its own aspect ratio inside this square ceiling, never cropped to it.
const MAX_EDGE = 140;
// INFO: § 13. A solo mini is drawn smaller than an emoticon message's own ceiling, so the two kinds read apart at a glance despite sharing the bubble-less, box-fitted layout below.
const MINI_MAX_EDGE = 100;

export type EmoticonBox = {
  width: number;
  height: number;
};

function fitBox(
  { width, height }: { width: number; height: number },
  maxEdge: number,
): EmoticonBox {
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * DESIGN.md § 6.5. The box an emoticon bubble occupies, fitted inside the § 6.5.
 * ceiling.
 *
 * INFO: Shared with REQUIREMENTS.md § 8.3.'s row estimate rather than kept beside the bubble — an emoticon's height is knowable before it renders, and the estimate is only worth anything if it is the same arithmetic the bubble is drawn at.
 *
 * WARN: The scale is capped at 1, so a picture authored small draws at its own pixels rather than being blown up to the ceiling — a guaranteed blur otherwise.
 */
export function toEmoticonBox(box: { width: number; height: number }): EmoticonBox {
  return fitBox(box, MAX_EDGE);
}

/**
 * § 13. A lone inline (mini) emoticon's box — the same bubble-less, ceiling-fitted
 * layout `toEmoticonBox` gives an emoticon message, at `MINI_MAX_EDGE` instead of
 * `MAX_EDGE` so a solo mini never draws at the same size as a real emoticon message.
 *
 * INFO: Shared with REQUIREMENTS.md § 8.3.'s row estimate for the same reason `toEmoticonBox` is.
 */
export function toSoloEmoticonBox(box: { width: number; height: number }): EmoticonBox {
  return fitBox(box, MINI_MAX_EDGE);
}
