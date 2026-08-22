import type { MediaDraft } from "@/entities/media";
import { ensure } from "@/shared/lib";
import {
  TRANSPARENT_OUTPUT_MIME,
  createCanvas,
  encodeCanvasLossless,
  loadImage,
  renderThumbnail,
  toExtension,
} from "./canvas";
import { matteOffThread, type CutoutModel, type CutoutProgress } from "./cutout-worker-client";

export type { CutoutModel, CutoutProgress } from "./cutout-worker-client";

/**
 * REQUIREMENTS.md § 13.4.2. The same picture with its background gone, as a draft
 * the crop step can be handed in place of the one it replaces.
 *
 * WARN: The alpha is **multiplied into** whatever the source already had, never
 * assigned over it. A picked PNG can arrive with transparency of its own, and an
 * assignment would hand those pixels back to the model's opinion of them.
 *
 * WARN: Lossless, by § 13.4.'s rule: this is an intermediate the crop step decodes
 * again, and the one lossy pass belongs to that step. JPEG would flatten the cutout
 * back onto an opaque box.
 *
 * INFO: § 13.4.2. A video draft is matted off its poster, through the video model —
 * the result is the step's preview and nothing more, since the clip itself is matted
 * frame by frame at encode time.
 */
export async function applyCutout(
  draft: MediaDraft,
  kind: CutoutModel,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(
    kind === "video" ? ensure(draft.thumbnail, "a video draft has no poster") : draft.file,
  );

  try {
    const image = await loadImage(sourceUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = createCanvas(width, height);
    const context = ensure(canvas.getContext("2d"), "2d context unavailable");

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, width, height);
    // WARN: Read before the matte, because `matteOffThread` transfers that buffer and detaches it here.
    const rgba = new Uint8ClampedArray(pixels.data);
    const alpha = await matteOffThread(pixels, kind, onProgress);

    for (let index = 0; index < alpha.length; index++) {
      rgba[index * 4 + 3] = (rgba[index * 4 + 3] * alpha[index]) / 255;
    }

    context.putImageData(new ImageData(rgba, width, height), 0, 0);

    const encoded = await encodeCanvasLossless(canvas);
    const { blob: thumbnail, blurhash } = await renderThumbnail(
      canvas,
      width,
      height,
      TRANSPARENT_OUTPUT_MIME,
    );

    return {
      ...draft,
      file: new File([encoded.blob], toCutoutName(draft.file.name, encoded.mime), {
        type: encoded.mime,
      }),
      thumbnail,
      // INFO: § 13.4. The editor's PNG preview is never uploaded, so it declares no thumbnail format — `renderThumbnail` answers `null` for exactly this case.
      thumbnailMime: null,
      previewUrl: URL.createObjectURL(thumbnail),
      mime: encoded.mime,
      width,
      height,
      // WARN: Re-derived with the pixels, never carried over. `applyEdit` states the argument: a stale hash blurs to a picture the user edited away from — and here the background it averaged is the part that just left.
      blurhash,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function toCutoutName(name: string, mime: string): string {
  return `${name.replace(/\.[^.]+$/, "")}-cutout.${toExtension(mime)}`;
}
