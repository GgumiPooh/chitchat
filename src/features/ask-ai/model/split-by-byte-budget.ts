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

    while (measure(text.slice(start, end)) > maxBytes) {
      end -= 1;
    }

    // WARN: A UTF-16 surrogate pair split across two chunks turns one emoji into two replacement characters on the wire.
    if (end < text.length && isHighSurrogate(text.charCodeAt(end - 1))) {
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
