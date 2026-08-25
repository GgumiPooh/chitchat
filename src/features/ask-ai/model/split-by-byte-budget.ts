const encoder = new TextEncoder();

/**
 * Splits `text` into pieces whose `measure` never exceeds `maxBytes` —
 * defaults to raw UTF-8 byte length, but a caller publishing the result as one
 * field of a larger JSON payload should measure the *escaped* form instead
 * (`Buffer.byteLength(JSON.stringify(chunk))`), since a quote, backslash or
 * newline costs two bytes on the wire once it is inside a JSON string.
 */
export function splitByByteBudget(
  text: string,
  maxBytes: number,
  measure: (chunk: string) => number = (chunk) => encoder.encode(chunk).byteLength,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = text.length;

    // WARN: One unit of progress is the floor, whatever the budget says. A `maxBytes` too small for a single character would otherwise walk `end` past `start` forever, measuring `""` against a budget it cannot meet — a hung request rather than an oversized chunk.
    while (end > start + 1 && measure(text.slice(start, end)) > maxBytes) {
      end -= 1;
    }

    // WARN: A UTF-16 surrogate pair split across two chunks turns one emoji into two replacement characters on the wire.
    if (end < text.length && end > start + 1 && isHighSurrogate(text.charCodeAt(end - 1))) {
      end -= 1;
    }

    chunks.push(text.slice(start, end));
    start = end;
  }

  return chunks;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
