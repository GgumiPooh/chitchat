import type { Nullable } from "@/shared/lib";

/**
 * The one unambiguous keyword within one literal edit of the draft's last word.
 *
 * A direct containment match remains authoritative. This only supplies an initial
 * local recovery for a Hangul IME slip before there is a previous successful search.
 */
export function findKeywordTypo(text: string, keywords: Iterable<string>): Nullable<string> {
  const token = stripTrailingPunctuation([...text.matchAll(/\S+/gu)].at(-1)?.[0] ?? "");

  if (!token || Array.from(token).length < 2) {
    return null;
  }

  const entries = [...keywords];
  const chars = Array.from(token);

  for (const query of [token, chars.slice(1).join("")]) {
    if (Array.from(query).length < 2) {
      continue;
    }

    const candidate = findUniqueCandidate(query, entries);

    if (candidate !== null) {
      return candidate;
    }
  }

  return null;
}

function findUniqueCandidate(query: string, keywords: Iterable<string>): Nullable<string> {
  let candidate: Nullable<string> = null;

  for (const keyword of keywords) {
    if (isOneJamoEdit(keyword, query)) {
      if (candidate !== null && candidate !== keyword) {
        return null;
      }

      candidate = keyword;
    }
  }

  return candidate;
}

export function isOneJamoEdit(left: string, right: string): boolean {
  const leftChars = Array.from(stripTrailingPunctuation(left).normalize("NFD").toLowerCase());
  const rightChars = Array.from(stripTrailingPunctuation(right).normalize("NFD").toLowerCase());

  if (Math.abs(leftChars.length - rightChars.length) > 1) {
    return false;
  }

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < leftChars.length && rightIndex < rightChars.length) {
    if (leftChars[leftIndex] === rightChars[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;

      continue;
    }

    edits += 1;

    if (edits > 1) {
      return false;
    }

    if (leftChars.length > rightChars.length) {
      leftIndex += 1;
    } else if (leftChars.length < rightChars.length) {
      rightIndex += 1;
    } else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  return true;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/\p{P}+$/gu, "");
}
