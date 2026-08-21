import type { ThumbnailMime } from "@/shared/config";
import { ensure, type Nullable, type Optional } from "@/shared/lib";
import { encode } from "blurhash";
import { encodeAvifOffThread } from "./avif-worker-client";

// INFO: REQUIREMENTS.md § 9. The thumbnail every chat cell and library tile loads. 720 covers a 220px bubble (DESIGN.md § 6.5.) and a 3-column grid cell at 3× density.
export const THUMBNAIL_MAX_EDGE = 720;

// INFO: blurhash's own guidance for the encode's input. It is O(pixels × components), and a hash carrying four frequencies per axis has no detail a larger source could add to it.
const BLURHASH_MAX_EDGE = 32;

// INFO: The reference implementation's conventional default, spent on the long axis — a hash carries a fixed budget of frequencies, and a phone's portrait photo needs them down the picture rather than across it.
const BLURHASH_COMPONENTS_LONG = 4;

const BLURHASH_COMPONENTS_SHORT = 3;

// WARN: iOS Safari refuses to allocate a canvas past roughly 16.7M pixels and silently hands back a blank one, and a modern iPhone photo is larger than that. Deliberately under 4096 — a square crop at that edge is 16.78M and lands the wrong side of the ceiling. Only edited images are re-encoded, so an untouched original never meets it.
export const EDITED_MAX_EDGE = 4_000;

// INFO: The actual policy cap for a chat-attached still image, same 1920 `VIDEO_MAX_LONG_EDGE` and `BACKGROUND_MAX_EDGE` already cap at — `EDITED_MAX_EDGE` above stays as the iOS canvas-pixel safety ceiling underneath it.
export const STILL_IMAGE_MAX_EDGE = 1920;

const THUMBNAIL_QUALITY = 0.82;

const EDITED_QUALITY = 0.92;

// INFO: jSquash's 0-100 scale, not the canvas 0-1 scale `THUMBNAIL_QUALITY`/`EDITED_QUALITY` use for the JPEG fallback beside each.
export const THUMBNAIL_AVIF_QUALITY = 45;

export const EDITED_AVIF_QUALITY = 55;

export const OUTPUT_MIME = "image/jpeg";

// INFO: REQUIREMENTS.md § 13.4. What an emoticon is encoded as. JPEG would replace its transparency with an opaque box, which is invisible inside a bubble and glaring on the bubble-less emoticon of DESIGN.md § 6.5.
export const TRANSPARENT_OUTPUT_MIME = "image/png";

/** The file extension `mime` is written out with, so an edited file keeps a name that matches its bytes. */
export function toExtension(mime: string): string {
  if (mime === TRANSPARENT_OUTPUT_MIME) {
    return "png";
  }

  return mime === "image/avif" ? "avif" : "jpg";
}

export type EncodedStillImage = {
  blob: Blob;
  // INFO: Widened past `ThumbnailMime` — `encodeCanvas`'s fallback is a caller-chosen mime (§ 13.4.'s PNG among them), not only the two § 9. thumbnail formats.
  mime: string;
  width: number;
  height: number;
};

// WARN: Firefox and Safari have no AVIF encoder and `canvas.toBlob("image/avif")` silently answers a PNG on both, per spec — this goes through `@jsquash/avif` instead and never touches that call, so there is no PNG to mistake for a real encode.
// INFO: The encode itself runs off the main thread, in `avif-encoder.worker.ts` — `getImageData` cannot, since a worker has no DOM to hold the canvas.
async function tryEncodeAvif(canvas: HTMLCanvasElement, quality: number): Promise<Nullable<Blob>> {
  try {
    const context = ensure(canvas.getContext("2d"), "2d context unavailable");
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const buffer = await encodeAvifOffThread(imageData, quality);

    return new Blob([buffer], { type: "image/avif" });
  } catch {
    return null;
  }
}

/**
 * Encodes a single already-rasterised frame as AVIF, falling back to JPEG when the
 * encoder is unavailable or the encode itself fails — never throws, since a failed
 * optimisation must not fail the upload it is serving.
 *
 * WARN: Takes a canvas rather than a source image or file, so nothing here can be
 * handed more than the one frame a caller already drew — `encodeStillImage` is the
 * entry point that sees raw bytes, and it is where an animated image is turned away
 * before a canvas like this one could flatten it.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  avifQuality: number,
  isThumbnail: boolean,
  // WARN: § 13.4. Defaults to the JPEG every existing caller relies on — the emoticon path is the one caller that must pass `TRANSPARENT_OUTPUT_MIME`, since JPEG has no alpha and an emoticon renders without a bubble (DESIGN.md § 6.5.).
  fallbackMime: string = OUTPUT_MIME,
): Promise<EncodedStillImage> {
  const size = { width: canvas.width, height: canvas.height };
  const avif = await tryEncodeAvif(canvas, avifQuality);

  if (avif) {
    return { blob: avif, mime: "image/avif", ...size };
  }

  return { blob: await toBlob(canvas, isThumbnail, fallbackMime), mime: fallbackMime, ...size };
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
  // WARN: § 9. Whichever format the encode actually produced, and the upload has to declare it — the ticket signs the `_thumb` PUT for one type, so a JPEG fallback that went unreported would be stored under an AVIF signature. Null when the caller named a format outside that pair, which is the § 13.4. editor's PNG preview and is never uploaded.
  mime: Nullable<ThumbnailMime>;
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
  mime: Optional<string> = undefined,
): Promise<RenderedThumbnail> {
  const size = fitWithin(width, height, THUMBNAIL_MAX_EDGE);
  const canvas = createCanvas(size.width, size.height);
  const context = ensure(canvas.getContext("2d"), "2d context unavailable");

  context.drawImage(source, 0, 0, size.width, size.height);

  // WARN: § 13.4. A named mime is the emoticon editor's PNG preview, which must keep its alpha and never becomes AVIF — every other caller leaves this unset and takes the § 9. thumbnail format.
  if (mime) {
    // WARN: The encode is started before the hash is taken, not after. `toBlob` snapshots the bitmap at the call and finishes off-thread, so the two overlap — awaiting it first serialises a main-thread decode behind an encode that was not waiting for it.
    const encoding = toBlob(canvas, true, mime);

    return { blurhash: toBlurhash(canvas), blob: await encoding, mime: null };
  }

  // WARN: The hash is taken first here, unlike the branch above — the AVIF encoder is wasm on this same thread, so there is no off-thread encode for it to overlap with and awaiting it first would only delay the hash.
  const blurhash = toBlurhash(canvas);
  // WARN: No fallback mime is passed, so `encodeCanvas` can only answer AVIF or its own JPEG default — the cast is `encodeCanvas`'s own guarantee, not an assumption made here.
  const encoded = await encodeCanvas(canvas, THUMBNAIL_AVIF_QUALITY, true);

  return { blurhash, blob: encoded.blob, mime: encoded.mime as ThumbnailMime };
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
