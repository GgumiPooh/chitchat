import type { Optional } from "./nullish";

export type FadeMaskOptions = {
  direction: "to bottom" | "to right";
  fadeStart: boolean;
  fadeEnd: boolean;
  startLength?: string;
  endLength?: string;
};

const DEFAULT_LENGTH = "2rem";

/**
 * A `mask-image` gradient that dissolves a scroller's content at its edges.
 * Returns `undefined` when neither edge fades, so the mask can be dropped
 * rather than applied as a no-op — a live mask puts the scroller on its own
 * compositing layer for nothing.
 */
export function buildFadeMask({
  direction,
  fadeStart,
  fadeEnd,
  startLength = DEFAULT_LENGTH,
  endLength = DEFAULT_LENGTH,
}: FadeMaskOptions): Optional<string> {
  if (!fadeStart && !fadeEnd) {
    return undefined;
  }

  // INFO: DESIGN.md § 8.1. waiver — `black` is mask luminance here, not a design colour.
  const start = fadeStart ? `transparent 0, black ${startLength}` : "black 0";
  const end = fadeEnd ? `black calc(100% - ${endLength}), transparent 100%` : "black 100%";

  return `linear-gradient(${direction}, ${start}, ${end})`;
}
