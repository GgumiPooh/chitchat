import type { MediaDraft } from "@/entities/media";
import { EMOTICON_MAX_EDGE, isAnimatedImage, type EmoticonImageSlot } from "@/shared/config";
import { randomId } from "@/shared/lib";
import type { ApplyEditOptions } from "./apply-edit";
import {
  TRANSPARENT_OUTPUT_MIME,
  createCanvas,
  fitWithin,
  loadImage,
  toBlob,
  toExtension,
} from "./canvas";

/** What `MediaEditor` must be given so an emoticon crop keeps its alpha (REQUIREMENTS.md § 13.4.). */
export const EMOTICON_IMAGE_EDIT_OPTIONS: ApplyEditOptions = {
  outputMime: TRANSPARENT_OUTPUT_MIME,
  maxEdge: EMOTICON_MAX_EDGE,
};

/** A picked file, read into the image slot its own bytes put it in. */
export type EmoticonImagePick = {
  draft: MediaDraft;
  slot: EmoticonImageSlot;
};

/**
 * Reads a picked file into one of an emoticon's two image slots
 * (REQUIREMENTS.md § 13.2.).
 *
 * WARN: The slot is decided by `isAnimatedImage` and never by the file's type. A
 * `.webp` and a `.gif` are each legal for one frame, and an APNG arrives as
 * `image/png` — so the mime is wrong in both directions, and wrong silently.
 *
 * WARN: An animation is carried through **byte for byte**. A canvas re-encode
 * decodes one frame, which would turn the animation the user picked into a
 * picture — so it is uploaded at whatever size it already is, and it can never
 * enter `MediaEditor` (§ 13.4.).
 *
 * WARN: A still is **always** re-encoded, even a PNG that would have passed
 * through untouched. An emoticon has no derivative to fall back on — it is
 * rendered directly (DESIGN.md § 6.5.) — so a `heic` from an iPhone would be
 * unreadable to whichever participant is not on iOS, and an un-downscaled photo
 * would be megabytes of PNG behind a 140px box.
 */
export async function toEmoticonImagePick(file: File): Promise<EmoticonImagePick> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  return isAnimatedImage(bytes)
    ? { draft: await toAnimatedDraft(file), slot: "animated-image" }
    : { draft: await toStillDraft(file), slot: "still-image" };
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
      // INFO: § 13.3. Null for the reason `toAnimatedDraft` gives — an emoticon has no `_thumb` sibling and no `media` row to carry a placeholder on.
      blurhash: null,
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
