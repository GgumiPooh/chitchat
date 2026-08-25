import { measureLineHeight, type Nullable } from "@/shared/lib";

// WARN: REQUIREMENTS.md § 8.16. Characters, never rendered lines. The § 8.3. estimate and the bubble both answer from `text` alone and so cannot disagree about whether a bubble is cut; a line count would put the estimate's canvas at every call site that draws one.
const EXPANDABLE_LENGTH = 500;

/** DESIGN.md § 6.2.2. How much of a cut bubble survives. */
export const TRUNCATED_LINES = 10;

// WARN: One number spelled twice — Tailwind cannot read the constant above, so the two move together.
export const TRUNCATED_TEXT_CLASS = "line-clamp-10";

/** REQUIREMENTS.md § 8.3. One `chat-body` line as the engine lays it out, which is what every bubble is priced at. */
export function toBodyLine(): number {
  return measureLineHeight("text-chat-body", 15 * 1.45);
}

export function isExpandableBody(text: Nullable<string>): boolean {
  return (text?.length ?? 0) > EXPANDABLE_LENGTH;
}

/** DESIGN.md § 6.2.2. Where an § 8.15. answer is cut, its markdown blocks having no line count to clamp. */
export function toTruncatedBodyHeight(): number {
  return TRUNCATED_LINES * toBodyLine();
}
