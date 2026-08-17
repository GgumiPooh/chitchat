import type { InlineEmoticonInfo } from "@/shared/config";
import type { Optional } from "@/shared/lib";

export type InlineEmoticonBox = {
  /** Width as a multiple of the line the emoticon stands in — `aspect-ratio` in the bubble, pixels in the estimate. */
  ratio: number;
  /** Whether the page's map sized this id at all. */
  isKnown: boolean;
};

/**
 * REQUIREMENTS.md § 13. The box one inline emoticon occupies, for the bubble that draws
 * it and the § 8.3. estimate that prices it.
 *
 * WARN: Both read it from here, exactly as a lone one reads `toSoloEmoticonBox` — the two
 * are one answer to "how wide is this", and priced apart they re-wrap the sentence the
 * moment it renders.
 *
 * INFO: A square stands in for an id the page did not size, and it is a guess about the ratio alone: § 13. fixes an inline emoticon's height at one line whatever its picture turns out to be.
 */
export function toInlineEmoticonBox(info: Optional<InlineEmoticonInfo>): InlineEmoticonBox {
  return info && info.width > 0 && info.height > 0
    ? { ratio: info.width / info.height, isKnown: true }
    : { ratio: 1, isKnown: false };
}
