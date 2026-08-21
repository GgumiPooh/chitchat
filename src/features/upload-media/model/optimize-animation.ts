import type { Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fitWithin, loadImage } from "./canvas";
import { enqueueFfmpeg, loadFfmpeg, toEvenEdge } from "./ffmpeg-runtime";
import { unoptimized, type EncodeProgress, type OptimizedMedia } from "./optimize-result";

export const ANIMATION_MIME = "image/webp";

// INFO: Same policy cap `optimize-video.ts`'s `VIDEO_MAX_LONG_EDGE` and `canvas.ts`'s `STILL_IMAGE_MAX_EDGE` apply, on an animation's own long edge.
export const ANIMATION_MAX_LONG_EDGE = 1920;

// INFO: `libwebpenc_common.c`'s own default for the private `quality` option (0-100).
const ANIMATION_WEBP_QUALITY = 75;

// INFO: `libwebpenc_common.c`'s max (0-6) — a one-off browser encode has no reason to trade time for the smaller default.
const ANIMATION_WEBP_COMPRESSION_LEVEL = 6;

/**
 * `maxEdge` caps the animation's long edge before encoding. `lossless` selects
 * `-lossless 1` over the default lossy `-lossless 0 -quality {@link ANIMATION_WEBP_QUALITY}` —
 * libwebp ignores quality once lossless is set, so the two are never passed together.
 */
export type OptimizeAnimationOptions = {
  maxEdge: number;
  lossless?: boolean;
};

const DEFAULT_OPTIONS: OptimizeAnimationOptions = {
  maxEdge: ANIMATION_MAX_LONG_EDGE,
  lossless: false,
};

/**
 * REQUIREMENTS.md § 9. Re-encodes an animated GIF/WebP/APNG to animated WebP, in
 * the browser, ahead of the upload pipeline. Falls back to the original `file`
 * whenever optimizing would not help or cannot be done safely — this must never
 * fail an upload.
 *
 * WARN: Takes `bytes` alongside `file` rather than re-reading it — `optimize-draft.ts`
 * has already read the whole file once to answer `isAnimatedImage`, and handing that
 * buffer straight to ffmpeg's virtual FS is what keeps this a single pass over it.
 *
 * WARN: `-c:v libwebp_anim`, never plain `libwebp` — the latter also emits an
 * animated file but encodes every frame independently, losing libwebp's
 * inter-frame optimization while still "working".
 */
export async function optimizeAnimation(
  file: File,
  bytes: Uint8Array,
  onProgress?: EncodeProgress,
  options: OptimizeAnimationOptions = DEFAULT_OPTIONS,
): Promise<OptimizedMedia> {
  const { maxEdge, lossless = false } = options;
  const inputName = `${crypto.randomUUID()}-input`;
  const outputName = `${crypto.randomUUID()}-output.webp`;
  const handleProgress = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(1, Math.max(0, progress)));

  let ffmpeg: Nullable<FFmpeg> = null;

  return enqueueFfmpeg(async () => {
    try {
      const [loaded, size] = await Promise.all([loadFfmpeg(), measureSize(file, maxEdge)]);

      ffmpeg = loaded;
      ffmpeg.on("progress", handleProgress);

      await ffmpeg.writeFile(inputName, bytes);

      const exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        "-vf",
        `scale=${toEvenEdge(size.width)}:${toEvenEdge(size.height)}`,
        "-c:v",
        "libwebp_anim",
        "-lossless",
        lossless ? "1" : "0",
        ...(lossless ? [] : ["-quality", `${ANIMATION_WEBP_QUALITY}`]),
        "-compression_level",
        `${ANIMATION_WEBP_COMPRESSION_LEVEL}`,
        "-loop",
        "0",
        "-an",
        "-vsync",
        "0",
        outputName,
      ]);

      if (exitCode !== 0) {
        return unoptimized(file);
      }

      const data = await ffmpeg.readFile(outputName);

      if (typeof data === "string") {
        return unoptimized(file);
      }

      // WARN: `data`'s buffer is typed `ArrayBufferLike`, which admits `SharedArrayBuffer` — `File` only accepts `ArrayBuffer`, so a fresh copy is the cast.
      const optimized = new File([new Uint8Array(data)], toOptimizedName(file.name), {
        type: ANIMATION_MIME,
      });

      return optimized.size < file.size
        ? { file: optimized, width: toEvenEdge(size.width), height: toEvenEdge(size.height) }
        : unoptimized(file);
    } catch {
      return unoptimized(file);
    } finally {
      ffmpeg?.off("progress", handleProgress);
      // INFO: The instance is cached and reused by the next call, so its virtual FS is cleared per-call rather than per-load.
      await Promise.allSettled([ffmpeg?.deleteFile(inputName), ffmpeg?.deleteFile(outputName)]);
    }
  });
}

async function measureSize(
  file: File,
  maxEdge: number,
): Promise<{ width: number; height: number }> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);

    return fitWithin(image.naturalWidth, image.naturalHeight, maxEdge);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function toOptimizedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.webp`;
}
