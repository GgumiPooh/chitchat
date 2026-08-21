import type { Nullable } from "@/shared/lib";

export type ImageSize = { width: number; height: number };

/** How much of an image the reader needs — every format below states its box in the first few KB, and JPEG's frame header sits after its EXIF, which this is sized for. */
export const IMAGE_HEADER_BYTES = 64 * 1024;

/**
 * REQUIREMENTS.md § 8.9. The pixel box out of an image's header, for JPEG, PNG, GIF
 * and WebP — the four a page's `og:image` is in practice. `null` for anything else,
 * or for a header the bytes in hand do not reach.
 *
 * WARN: A header reader and not a decoder, deliberately: the bytes come from the host
 * the link names (§ 14.), and this walks markers with bounds checks rather than handing
 * them to a codec.
 */
export function readImageSize(bytes: Uint8Array): Nullable<ImageSize> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (startsWith(bytes, [0x47, 0x49, 0x46]) && bytes.length >= 10) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }

  if (startsWith(bytes, [0xff, 0xd8])) {
    return readJpegSize(bytes, view);
  }

  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return readWebpSize(bytes, view);
  }

  return null;
}

// INFO: The frame header is the first `SOFn` marker; every other segment is skipped by its own stated length.
function readJpegSize(bytes: Uint8Array, view: DataView): Nullable<ImageSize> {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }

    const marker = bytes[offset + 1];

    if (marker === 0xff) {
      offset += 1;
      continue;
    }

    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isFrame) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }

    offset += 2 + view.getUint16(offset + 2);
  }

  return null;
}

// INFO: Three encodings, three boxes — `VP8 ` states it after its frame tag, `VP8L` packs it into 28 bits, and `VP8X` carries it as 24-bit values one short of the size.
function readWebpSize(bytes: Uint8Array, view: DataView): Nullable<ImageSize> {
  if (bytes.length < 30) {
    return null;
  }

  const chunk = String.fromCharCode(...bytes.subarray(12, 16));

  if (chunk === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }

  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);

    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (chunk === "VP8X") {
    return { width: readUint24(bytes, 24) + 1, height: readUint24(bytes, 27) + 1 };
  }

  return null;
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
