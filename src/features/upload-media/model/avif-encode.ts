import { isAnimatedImage } from "@/shared/config";
import { ensure, type Nullable } from "@/shared/lib";
import { createCanvas, encodeCanvas, fitWithin, loadImage, type EncodedStillImage } from "./canvas";

export type EncodeStillImageOptions = {
  maxEdge: number;
  avifQuality: number;
  isThumbnail?: boolean;
  // INFO: The file's own bytes when the caller has already read them — `optimizeDraft` reads the whole file to answer `isAnimatedImage` and would otherwise buy a second full-size buffer here.
  bytes?: Uint8Array;
};

/**
 * REQUIREMENTS.md § 9. The safe entry point for a still image picked straight from
 * disk: reads the file's own bytes and refuses (`null`) an animated one rather than
 * flattening it to a single frame, which is exactly what drawing it to a canvas
 * would do.
 *
 * WARN: `encodeCanvas` is the unguarded half and takes a canvas precisely so it
 * cannot be handed a source that animates — never reach for it with a picked file.
 */
export async function encodeStillImage(
  file: File,
  { maxEdge, avifQuality, isThumbnail = false, bytes }: EncodeStillImageOptions,
): Promise<Nullable<EncodedStillImage>> {
  // WARN: The whole file, not a prefix — `isAnimatedImage` has to reach a GIF's second image descriptor, which may sit anywhere in it. Re-checked even when the caller passed bytes, so the guard cannot be skipped by a caller that got it wrong.
  if (isAnimatedImage(bytes ?? new Uint8Array(await file.arrayBuffer()))) {
    return null;
  }

  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const size = fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = createCanvas(size.width, size.height);
    const context = ensure(canvas.getContext("2d"), "2d context unavailable");

    context.drawImage(image, 0, 0, size.width, size.height);

    return await encodeCanvas(canvas, avifQuality, isThumbnail);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
