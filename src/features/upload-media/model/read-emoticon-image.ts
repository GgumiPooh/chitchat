import type { MediaDraft } from "@/entities/media";
import { EMOTICON_MAX_EDGE, isAnimatableEmoticonMime } from "@/shared/config";
import { A_KILOBYTE, randomId } from "@/shared/lib";
import type { ApplyEditOptions } from "./apply-edit";
import {
  TRANSPARENT_OUTPUT_MIME,
  createCanvas,
  fitWithin,
  loadImage,
  toBlob,
  toExtension,
} from "./canvas";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const PNG_CHUNK_HEADER_BYTES = 8;

// INFO: `acTL` sits within a few dozen bytes of the signature in practice; this only has to outlast whatever colour and metadata chunks an encoder put before it.
const APNG_SCAN_BYTES = 64 * A_KILOBYTE;

/** What `MediaEditor` must be given so an emoticon crop keeps its alpha (REQUIREMENTS.md § 13.4.). */
export const EMOTICON_IMAGE_EDIT_OPTIONS: ApplyEditOptions = {
  outputMime: TRANSPARENT_OUTPUT_MIME,
  maxEdge: EMOTICON_MAX_EDGE,
};

/**
 * Reads a picked file into the single image an emoticon item is registered from
 * (REQUIREMENTS.md § 13.2.).
 *
 * WARN: A file whose type may animate is carried through **byte for byte**. A
 * canvas re-encode decodes one frame, which would silently turn the animation the
 * user picked into a picture — so it is uploaded at whatever size it already is,
 * and it can never enter `MediaEditor` (§ 13.4.).
 *
 * WARN: Anything else is **always** re-encoded, even a PNG that would have passed
 * through untouched. An emoticon has no derivative to fall back on — it is rendered
 * directly (DESIGN.md § 6.5.) — so a `heic` from an iPhone would be unreadable to
 * whichever participant is not on iOS, and an un-downscaled photo would be
 * megabytes of PNG behind a 140px box.
 */
export async function toEmoticonImageDraft(file: File): Promise<MediaDraft> {
  const mime = await readEmoticonMime(file);

  return isAnimatableEmoticonMime(mime) ? toAnimatedDraft(file, mime) : toStillDraft(file);
}

/**
 * The type the rest of the flow treats the file as, which is not always `file.type`.
 *
 * WARN: An APNG arrives as `image/png`, because a `File`'s type comes from the OS
 * extension map and `.png` maps to one type however the bytes were encoded. Left at
 * that it would take the still path and the canvas would flatten the animation to
 * its first frame — the exact failure the note above forbids — so the animation
 * control chunk is sniffed and the file is renamed to `image/apng` for § 13.4.
 */
async function readEmoticonMime(file: File): Promise<string> {
  if (isAnimatableEmoticonMime(file.type) || file.type !== "image/png") {
    return file.type;
  }

  return (await hasApngControlChunk(file)) ? "image/apng" : file.type;
}

// INFO: `acTL` is what makes a PNG an APNG, and the spec requires it before the first `IDAT` — so the scan stops there rather than reading the whole file.
async function hasApngControlChunk(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, APNG_SCAN_BYTES).arrayBuffer());

  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return false;
  }

  const view = new DataView(bytes.buffer);
  let offset = PNG_SIGNATURE.length;

  while (offset + PNG_CHUNK_HEADER_BYTES <= bytes.length) {
    const type = String.fromCharCode(
      ...bytes.subarray(offset + 4, offset + PNG_CHUNK_HEADER_BYTES),
    );

    if (type === "acTL") {
      return true;
    }

    if (type === "IDAT") {
      return false;
    }

    // INFO: A chunk is its 4-byte length, its 4-byte type, its payload and a 4-byte CRC.
    offset += PNG_CHUNK_HEADER_BYTES + view.getUint32(offset) + 4;
  }

  return false;
}

/** INFO: The decoded first frame is what carries the size, and its box is the one every later frame shares — which is what § 8.3. reserves the row from. */
async function toAnimatedDraft(file: File, mime: string): Promise<MediaDraft> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);

    return {
      id: randomId(),
      file,
      thumbnail: file,
      previewUrl,
      mime,
      width: image.naturalWidth,
      height: image.naturalHeight,
      durationMs: null,
      filename: null,
      waveformPeaks: null,
    };
  } catch (error) {
    // WARN: Only the failure path releases it. On the way out the URL *is* the draft's preview, and revoking it would leave the caller with a `previewUrl` nothing can render.
    URL.revokeObjectURL(previewUrl);

    throw error;
  }
}

/** WARN: The dimensions come from the *encoded* canvas, not the source file. § 8.3. reserves the bubble's box from them, so they must describe the bytes that were actually stored. */
async function toStillDraft(file: File): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const size = fitWithin(image.naturalWidth, image.naturalHeight, EMOTICON_MAX_EDGE);
    const canvas = createCanvas(size.width, size.height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("2d context unavailable");
    }

    context.drawImage(image, 0, 0, size.width, size.height);

    const blob = await toBlob(canvas, false, TRANSPARENT_OUTPUT_MIME);

    return {
      id: randomId(),
      file: new File([blob], toStillName(file.name), { type: TRANSPARENT_OUTPUT_MIME }),
      // INFO: An emoticon has no `_thumb` sibling (§ 13.3.), so the image stands in for one — nothing uploads it, and it is what the tray preview renders.
      thumbnail: blob,
      previewUrl: URL.createObjectURL(blob),
      mime: TRANSPARENT_OUTPUT_MIME,
      width: size.width,
      height: size.height,
      durationMs: null,
      filename: null,
      waveformPeaks: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function toStillName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(TRANSPARENT_OUTPUT_MIME)}`;
}
