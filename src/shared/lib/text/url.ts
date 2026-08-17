import type { Nullable } from "../nullish";

// WARN: `http(s)` only, and deliberately no bare-domain rule — `1.5.` or `가.나` would otherwise linkify, and a false positive is a bubble that navigates away on a mis-tap.
// WARN: U+FFFC ends the run as surely as a space does — it is REQUIREMENTS.md § 13.'s inline emoticon, an object standing in the text rather than a character of the address. Left in the class, an emoticon typed straight after a link makes the two one match, and § 8.9.'s card is scraped for a URL nobody wrote.
const URL_PATTERN = /https?:\/\/[^\s<>"'\uFFFC]+/gi;

// INFO: Sentence punctuation belongs to the sentence, not to the URL — `봤어? https://a.com/b.` ends in a full stop that is not part of the path.
const TRAILING_PUNCTUATION = /[.,!?;:'"·…]+$/;

export type TextSegment = {
  kind: "text" | "url";
  value: string;
};

/**
 * Splits a message body into plain runs and the URLs between them, so a bubble
 * can render the links as anchors without touching the rest of the text.
 */
export function splitTextByUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const url = trimUrlTail(match[0]);

    if (start > cursor) {
      segments.push({ kind: "text", value: text.slice(cursor, start) });
    }

    segments.push({ kind: "url", value: url });
    cursor = start + url.length;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", value: text.slice(cursor) });
  }

  return segments;
}

/** The URL a message previews. The first one, never all of them — one bubble is one card. */
export function findFirstUrl(text: Nullable<string>): Nullable<string> {
  if (!text) {
    return null;
  }

  const match = text.match(URL_PATTERN)?.[0];

  return match ? trimUrlTail(match) : null;
}

/**
 * The URL without its fragment.
 *
 * INFO: The fragment never reaches the server, so two links that differ only in it
 * describe the same page — this is what keeps them on one cache entry on both
 * sides of `/api/link-preview` (REQUIREMENTS.md § 8.9.).
 */
export function withoutFragment(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";

    return parsed.toString();
  } catch {
    return url;
  }
}

/** Whether the string is an absolute `http(s)` URL, which is the only thing the app ever fetches or renders. */
export function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// INFO: A closing bracket only leaves the URL when nothing inside it opened one — Wikipedia paths carry `(...)` and cutting there is a 404.
function trimUrlTail(url: string): string {
  let trimmed = url.replace(TRAILING_PUNCTUATION, "");

  while (trimmed.endsWith(")") && countChar(trimmed, ")") > countChar(trimmed, "(")) {
    trimmed = trimmed.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
  }

  return trimmed;
}

function countChar(value: string, char: string): number {
  return value.split(char).length - 1;
}
