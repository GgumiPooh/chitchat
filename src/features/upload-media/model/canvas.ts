import { ensure, type Nullable } from "@/shared/lib";
import { encode } from "blurhash";

// INFO: REQUIREMENTS.md § 9. The thumbnail every chat cell and library tile loads. 720 covers a 220px bubble (DESIGN.md § 6.5.) and a 3-column grid cell at 3× density.
export const THUMBNAIL_MAX_EDGE = 720;

// INFO: blurhash's own guidance for the encode's input. It is O(pixels × components), and a hash carrying four frequencies per axis has no detail a larger source could add to it.
const BLURHASH_MAX_EDGE = 32;

// INFO: The reference implementation's conventional default, spent on the long axis — a hash carries a fixed budget of frequencies, and a phone's portrait photo needs them down the picture rather than across it.
const BLURHASH_COMPONENTS_LONG = 4;

const BLURHASH_COMPONENTS_SHORT = 3;

// WARN: iOS Safari refuses to allocate a canvas past roughly 16.7M pixels and silently hands back a blank one, and a modern iPhone photo is larger than that. Deliberately under 4096 — a square crop at that edge is 16.78M and lands the wrong side of the ceiling. Only edited images are re-encoded, so an untouched original never meets it.
export const EDITED_MAX_EDGE = 4_000;

const THUMBNAIL_QUALITY = 0.82;

const EDITED_QUALITY = 0.92;

export const OUTPUT_MIME = "image/jpeg";

// INFO: REQUIREMENTS.md § 13.4. What an emoticon is encoded as. JPEG would replace its transparency with an opaque box, which is invisible inside a bubble and glaring on the bubble-less emoticon of DESIGN.md § 6.5.
export const TRANSPARENT_OUTPUT_MIME = "image/png";

/** The file extension `mime` is written out with, so an edited file keeps a name that matches its bytes. */
export function toExtension(mime: string): string {
  return mime === TRANSPARENT_OUTPUT_MIME ? "png" : "jpg";
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image decode failed"));
    image.src = src;
  });
}

// INFO: `quality` is ignored by the PNG encoder, so the same call serves both output types.
export function toBlob(
  canvas: HTMLCanvasElement,
  isThumbnail = false,
  mime: string = OUTPUT_MIME,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas encode failed"))),
      mime,
      isThumbnail ? THUMBNAIL_QUALITY : EDITED_QUALITY,
    );
  });
}

/** The size that fits inside `maxEdge` on its long side, never scaling up. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  return canvas;
}

/**
 * WARN: Safari only gained `CanvasRenderingContext2D.filter` in 17. Without the
 * detection an older WebKit drops the property silently and the export comes back
 * unfiltered while the preview showed the filter — cropping still works, so the
 * degradation is worth taking over refusing to export.
 */
export function supportsCanvasFilter(context: CanvasRenderingContext2D): boolean {
  return "filter" in context;
}

/** The `_thumb` object of REQUIREMENTS.md § 9., and the placeholder that stands in for it while it loads. */
export type RenderedThumbnail = {
  blob: Blob;
  blurhash: Nullable<string>;
};

/**
 * The `_thumb` sibling of REQUIREMENTS.md § 9., rendered from whatever already
 * holds the pixels.
 *
 * WARN: The two come back together because they must be derived from the same
 * pixels — `toBlurhash` below says what a hash of anything else does.
 */
export async function renderThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
  mime: string = OUTPUT_MIME,
): Promise<RenderedThumbnail> {
  const size = fitWithin(width, height, THUMBNAIL_MAX_EDGE);
  const canvas = createCanvas(size.width, size.height);
  const context = ensure(canvas.getContext("2d"), "2d context unavailable");

  context.drawImage(source, 0, 0, size.width, size.height);

  // WARN: The encode is started before the hash is taken, not after. `toBlob` snapshots the bitmap at the call and finishes off-thread, so the two overlap — awaiting it first serialises a main-thread decode behind an encode that was not waiting for it.
  const encoding = toBlob(canvas, true, mime);

  return { blurhash: toBlurhash(canvas), blob: await encoding };
}

/**
 * REQUIREMENTS.md § 9. The blurred placeholder a thumbnail fades in over.
 *
 * WARN: Encoded from the **thumbnail's own pixels**, and it is a correctness rule
 * rather than a convenience. The hash stands in for the `_thumb` object and nothing
 * else, so a hash taken from any other image morphs into a different picture the
 * moment the real one lands — a video's poster is seeked well past frame 0
 * (`toPosterTime`), and `MediaEditor`'s crop and filters make the original a
 * different image again.
 *
 * WARN: Never call this with the source handed to `renderThumbnail`. It takes the
 * rendered canvas so the two cannot drift, which is also why it is not exported.
 *
 * WARN: A failure answers `null` rather than throwing. The `_thumb` blob beside it
 * is what the upload cannot proceed without; a missing placeholder falls back to
 * § 8.3.'s reserved box, which is what every row has drawn until now.
 */
function toBlurhash(thumbnail: HTMLCanvasElement): Nullable<string> {
  try {
    const size = fitWithin(thumbnail.width, thumbnail.height, BLURHASH_MAX_EDGE);
    const canvas = createCanvas(size.width, size.height);
    const context = ensure(canvas.getContext("2d"), "2d context unavailable");

    context.drawImage(thumbnail, 0, 0, size.width, size.height);

    const { data } = context.getImageData(0, 0, size.width, size.height);
    const isLandscape = size.width >= size.height;

    return encode(
      data,
      size.width,
      size.height,
      isLandscape ? BLURHASH_COMPONENTS_LONG : BLURHASH_COMPONENTS_SHORT,
      isLandscape ? BLURHASH_COMPONENTS_SHORT : BLURHASH_COMPONENTS_LONG,
    );
  } catch {
    return null;
  }
}
