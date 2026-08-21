import { findFirstUrl, type Nullable } from "@/shared/lib";
import type { InlineContent } from "./to-inline-content";

/**
 * DESIGN.md § 6.9. The URL a message is and nothing else, which draws as the card alone
 * once the card is there to draw — `null` for any words around it, or an emoticon.
 *
 * WARN: § 8.3. The bubble and the row estimate MUST both read this from here, for
 * `toInlineContent`'s reason: two spellings of "is this only a link" are a row drawn
 * bubble-less where the estimate priced a bubble.
 */
export function toLinkOnlyUrl(text: Nullable<string>, inline: InlineContent): Nullable<string> {
  if (!text || inline.kind !== "none") {
    return null;
  }

  const url = findFirstUrl(text);

  // INFO: Compared after the tail trim, so `https://a.com.` keeps its bubble — the full stop is a character the card would otherwise drop.
  return url !== null && text.trim() === url ? url : null;
}
