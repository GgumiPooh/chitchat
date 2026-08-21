import type { MediaDraft } from "@/entities/media";
import {
  IS_UPLOAD_OPTIMIZATION_ENABLED,
  isAnimatedImage,
  isAudioMime,
  isImageMime,
  isVideoMime,
  type MediaUploadScope,
} from "@/shared/config";
import { encodeStillImage } from "./avif-encode";
import { EDITED_AVIF_QUALITY, STILL_IMAGE_MAX_EDGE, toExtension } from "./canvas";
import { optimizeAnimation } from "./optimize-animation";
import { optimizeAudio } from "./optimize-audio";
import { unoptimized, type EncodeProgress, type OptimizedMedia } from "./optimize-result";
import { optimizeVideo } from "./optimize-video";

// INFO: § 9. What `encodeStillImage` answers when it succeeds, so a second pass over an already-encoded draft is skipped rather than paying generation loss for nothing.
const STILL_OUTPUT_MIME = "image/avif";

// INFO: The only three containers `isAnimatedImage` can find a loop in — JPEG/AVIF/HEIC/HEIF never carry one, so this is what keeps the § 9. detection read off the common case (a camera photo) rather than doubling it for every still.
const ANIMATABLE_IMAGE_MIMES = ["image/png", "image/gif", "image/webp"];

/**
 * REQUIREMENTS.md § 9. Re-encodes one attachment down to policy on the way to R2,
 * at send rather than at pick — the bytes are already staged, so this is the last
 * point that still owns them.
 *
 * WARN: Every path answers the original file rather than throwing. A saving that
 * cannot be had is not a send that fails.
 *
 * WARN: A voice message (§ 9.3.) is never routed here. It is bounded by
 * `MAX_VOICE_DURATION` and already small, and re-encoding it would cost the peaks
 * their own recording.
 */
export async function optimizeDraft(
  draft: MediaDraft,
  scope: MediaUploadScope,
  onProgress?: EncodeProgress,
): Promise<OptimizedMedia> {
  // WARN: The contract is held here rather than in each optimizer, because the dispatcher itself can throw — `arrayBuffer()` on a 50MB pick is an allocation, and a failed saving must never be a failed send.
  try {
    return await route(draft, scope, onProgress);
  } catch {
    return unoptimized(draft.file);
  }
}

async function route(
  draft: MediaDraft,
  scope: MediaUploadScope,
  onProgress?: EncodeProgress,
): Promise<OptimizedMedia> {
  // WARN: `chat` alone. An avatar or a background was already cut to its own cap by the editor that produced it (§ 12.), so running this over one is a second re-encode of the same picture for nothing — `cropVideo`'s output would be decoded and written again to lose 80 pixels.
  if (!IS_UPLOAD_OPTIMIZATION_ENABLED || scope !== "chat" || draft.waveformPeaks) {
    return unoptimized(draft.file);
  }

  if (isVideoMime(draft.mime)) {
    return optimizeVideo(draft.file, onProgress);
  }

  if (isImageMime(draft.mime) && draft.mime !== STILL_OUTPUT_MIME) {
    if (ANIMATABLE_IMAGE_MIMES.includes(draft.mime)) {
      // WARN: The whole file, not a prefix — same reason `encodeStillImage` reads it whole: a GIF's second image descriptor may sit anywhere in it.
      const bytes = new Uint8Array(await draft.file.arrayBuffer());

      if (isAnimatedImage(bytes)) {
        return optimizeAnimation(draft.file, bytes, onProgress);
      }

      return optimizeStill(draft, bytes);
    }

    return optimizeStill(draft);
  }

  // INFO: § 9.1. An attached sound file, never a § 9.3. recording — those are turned away above, by their peaks.
  if (isAudioMime(draft.mime)) {
    return optimizeAudio(draft.file);
  }

  return unoptimized(draft.file);
}

/**
 * WARN: Never reached for an animated image — `optimizeDraft` routes those to
 * `optimizeAnimation` first. `encodeStillImage`'s own `isAnimatedImage` refusal
 * stays as the structural guard regardless: drawing one to a canvas would flatten
 * it to its first frame.
 */
async function optimizeStill(draft: MediaDraft, bytes?: Uint8Array): Promise<OptimizedMedia> {
  const encoded = await encodeStillImage(draft.file, {
    maxEdge: STILL_IMAGE_MAX_EDGE,
    avifQuality: EDITED_AVIF_QUALITY,
    bytes,
  });

  if (!encoded || encoded.blob.size >= draft.file.size) {
    return unoptimized(draft.file);
  }

  return {
    file: new File([encoded.blob], toStillName(draft.file.name, encoded.mime), {
      type: encoded.mime,
    }),
    width: encoded.width,
    height: encoded.height,
  };
}

// WARN: Named from the mime the encode actually produced, never from the one it aimed at — an engine with no AVIF encoder falls back to JPEG, and a `.avif` holding JPEG bytes is a file 보관함 hands over under the wrong name.
function toStillName(name: string, mime: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.${toExtension(mime)}`;
}
