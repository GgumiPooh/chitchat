import type { MediaDraft } from "@/entities/media";
import { EMOTICON_MAX_EDGE } from "@/shared/config";
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
export const EMOTICON_STILL_EDIT_OPTIONS: ApplyEditOptions = {
  outputMime: TRANSPARENT_OUTPUT_MIME,
  maxEdge: EMOTICON_MAX_EDGE,
};

/**
 * Reads a picked file into the still an emoticon item is registered from
 * (REQUIREMENTS.md § 13.2.).
 *
 * WARN: **Always** re-encodes, even for a PNG that would have passed through
 * untouched. An emoticon has no derivative to fall back on — it is rendered
 * directly (DESIGN.md § 6.5.) — so a `heic` from an iPhone would be unreadable to
 * whichever participant is not on iOS, and an un-downscaled photo would be
 * megabytes of PNG behind a 140px box. Re-encoding settles both, which is why
 * `ALLOWED_EMOTICON_STILL_MIMES` has exactly one entry.
 *
 * WARN: The dimensions come from the *encoded* canvas, not the source file.
 * § 8.3. reserves the bubble's box from them, so they must describe the bytes
 * that were actually stored.
 */
export async function toEmoticonStillDraft(file: File): Promise<MediaDraft> {
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
      id: crypto.randomUUID(),
      file: new File([blob], toStillName(file.name), { type: TRANSPARENT_OUTPUT_MIME }),
      // INFO: An emoticon has no `_thumb` sibling (§ 13.3.), so the still stands in for one — nothing uploads it, and it is what the tray preview renders.
      thumbnail: blob,
      previewUrl: URL.createObjectURL(blob),
      mime: TRANSPARENT_OUTPUT_MIME,
      width: size.width,
      height: size.height,
      durationMs: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function toStillName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(TRANSPARENT_OUTPUT_MIME)}`;
}
