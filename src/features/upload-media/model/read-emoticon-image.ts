import type { MediaDraft } from "@/entities/media";
import { EMOTICON_MAX_EDGE, isAnimatedImage } from "@/shared/config";
import { ensure, randomId, type Nullable } from "@/shared/lib";
import type { ApplyEditOptions } from "./apply-edit";
import {
  TRANSPARENT_OUTPUT_MIME,
  createCanvas,
  fitWithin,
  loadImage,
  toBlob,
  toExtension,
} from "./canvas";
import { revokePreview } from "./revoke-preview";

/** What `MediaEditor` must be given so an emoticon crop keeps its alpha (REQUIREMENTS.md § 13.4.). */
export const EMOTICON_IMAGE_EDIT_OPTIONS: ApplyEditOptions = {
  outputMime: TRANSPARENT_OUTPUT_MIME,
  maxEdge: EMOTICON_MAX_EDGE,
};

const STILL_SAMPLE_FRAMES = 8;

// INFO: Enough to rank one frame against another by how full it is, and small enough that eight `getImageData` reads cost nothing.
const COVERAGE_EDGE = 32;

// INFO: Half opacity. The reduction to `COVERAGE_EDGE` averages alpha, so a frame drawn at a third of its final opacity has to score as the empty frame it looks like.
const OPAQUE_ALPHA = 128;

/** Both renderings of one picked file: the still every file yields, and the animation only an animated one does. */
export type EmoticonImageUpload = {
  still: MediaDraft;
  animated: Nullable<MediaDraft>;
};

/**
 * Reads one picked file into an emoticon's image slots (REQUIREMENTS.md § 13.2.).
 *
 * WARN: Whether it animates is decided by `isAnimatedImage` and never by the file's
 * type. A `.webp` and a `.gif` are each legal for one frame, and an APNG arrives as
 * `image/png` — so the mime is wrong in both directions, and wrong silently.
 *
 * WARN: An animation is carried through **byte for byte**, and its still is a frame
 * lifted out of it rather than a second encode of the file. A canvas re-encode
 * decodes one frame — which is what the still slot wants and what would turn the
 * animated slot into a picture (§ 13.4.), so it can never enter `MediaEditor`.
 *
 * WARN: A still is **always** re-encoded, even a PNG that would have passed through
 * untouched. An emoticon has no derivative to fall back on — it is rendered directly
 * (DESIGN.md § 6.5.) — so a `heic` from an iPhone would be unreadable to whichever
 * participant is not on iOS, and an un-downscaled photo would be megabytes of PNG
 * behind a 140px box.
 */
export async function toEmoticonImageUpload(file: File): Promise<EmoticonImageUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!isAnimatedImage(bytes)) {
    return { still: await toPickedStill(file), animated: null };
  }

  const animated = await toAnimatedDraft(file);

  try {
    return { still: await toExtractedStill(file, bytes), animated };
  } catch (error) {
    revokePreview(animated);

    throw error;
  }
}

/** INFO: The decoded first frame is what carries the size, and its box is the one every later frame shares — which is what § 8.3. reserves the row from. */
async function toAnimatedDraft(file: File): Promise<MediaDraft> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(previewUrl);

    return {
      id: randomId(),
      file,
      thumbnail: file,
      previewUrl,
      mime: file.type,
      width: image.naturalWidth,
      height: image.naturalHeight,
      durationMs: null,
      // INFO: § 13.3. An emoticon is rendered directly and registers no `_thumb` sibling, so there is no placeholder for a hash to stand behind.
      blurhash: null,
      filename: null,
      waveformPeaks: null,
    };
  } catch (error) {
    // WARN: Only the failure path releases it. On the way out the URL *is* the draft's preview, and revoking it would leave the caller with a `previewUrl` nothing can render.
    URL.revokeObjectURL(previewUrl);

    throw error;
  }
}

async function toPickedStill(file: File): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);

    return await toStillDraft(image, image.naturalWidth, image.naturalHeight, file.name);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/**
 * The still an animated file is drawn as wherever it does not play.
 *
 * WARN: The **fullest** sampled frame and not the first one. An animation that fades
 * in opens on a nearly empty frame, which reads as a half-transparent tile in the
 * picker; the server-side backfill chose the same way.
 *
 * INFO: `ImageDecoder` is the only API that reaches past an animation's frame 0 — where it is unavailable, the first frame is all `createImageBitmap` can give.
 */
async function toExtractedStill(file: File, bytes: Uint8Array): Promise<MediaDraft> {
  if (typeof ImageDecoder !== "undefined") {
    try {
      return await toFullestFrameStill(file, bytes);
    } catch {
      // INFO: A container this decoder cannot read still has a first frame, which is a worse still than the fullest one and a far better one than no item at all.
    }
  }

  const bitmap = await createImageBitmap(file);

  try {
    return await toStillDraft(bitmap, bitmap.width, bitmap.height, file.name);
  } finally {
    bitmap.close();
  }
}

async function toFullestFrameStill(file: File, bytes: Uint8Array): Promise<MediaDraft> {
  const decoder = new ImageDecoder({ data: bytes, type: file.type });

  try {
    await decoder.completed;

    const frame = await toFullestFrame(decoder);

    try {
      // WARN: Drawn while the decoder is still open — a `VideoFrame` is a handle on the decode rather than a copy of it.
      return await toStillDraft(frame, frame.displayWidth, frame.displayHeight, file.name);
    } finally {
      frame.close();
    }
  } finally {
    decoder.close();
  }
}

async function toFullestFrame(decoder: ImageDecoder): Promise<VideoFrame> {
  const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 1;
  const sampled = Math.min(frameCount, STILL_SAMPLE_FRAMES);
  let best: Nullable<{ frame: VideoFrame; coverage: number }> = null;

  for (let index = 0; index < sampled; index++) {
    // INFO: Spread across the whole animation rather than taken off its front, so a long fade is not mistaken for the whole of it.
    const { image } = await decoder.decode({
      frameIndex: Math.floor((index * frameCount) / sampled),
    });
    const coverage = toOpaqueCoverage(image);

    if (best && coverage <= best.coverage) {
      image.close();

      continue;
    }

    best?.frame.close();
    best = { frame: image, coverage };
  }

  return ensure(best, "no emoticon frame decoded").frame;
}

/** How much of a frame is drawn on, as a fraction of its box. */
function toOpaqueCoverage(frame: VideoFrame): number {
  const size = fitWithin(frame.displayWidth, frame.displayHeight, COVERAGE_EDGE);
  const canvas = createCanvas(size.width, size.height);
  const context = ensure(canvas.getContext("2d"), "2d context unavailable");

  context.drawImage(frame, 0, 0, size.width, size.height);

  const { data } = context.getImageData(0, 0, size.width, size.height);
  let opaque = 0;

  for (let offset = 3; offset < data.length; offset += 4) {
    if (data[offset] >= OPAQUE_ALPHA) {
      opaque++;
    }
  }

  return opaque / (size.width * size.height);
}

/** WARN: The dimensions come from the *encoded* canvas, not the source. § 8.3. reserves the bubble's box from them, so they must describe the bytes that were actually stored. */
async function toStillDraft(
  source: CanvasImageSource,
  width: number,
  height: number,
  name: string,
): Promise<MediaDraft> {
  const size = fitWithin(width, height, EMOTICON_MAX_EDGE);
  const canvas = createCanvas(size.width, size.height);
  const context = ensure(canvas.getContext("2d"), "2d context unavailable");

  context.drawImage(source, 0, 0, size.width, size.height);

  const blob = await toBlob(canvas, false, TRANSPARENT_OUTPUT_MIME);

  return {
    id: randomId(),
    file: new File([blob], toStillName(name), { type: TRANSPARENT_OUTPUT_MIME }),
    // INFO: An emoticon has no `_thumb` sibling (§ 13.3.), so the image stands in for one — nothing uploads it, and it is what the tray preview renders.
    thumbnail: blob,
    previewUrl: URL.createObjectURL(blob),
    mime: TRANSPARENT_OUTPUT_MIME,
    width: size.width,
    height: size.height,
    durationMs: null,
    // INFO: § 13.3. Null for the reason `toAnimatedDraft` gives — an emoticon has no `_thumb` sibling and no `media` row to carry a placeholder on.
    blurhash: null,
    filename: null,
    waveformPeaks: null,
  };
}

function toStillName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(TRANSPARENT_OUTPUT_MIME)}`;
}
