import type { Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fitWithin, loadImage } from "./canvas";
import { unoptimized, type EncodeProgress, type OptimizedMedia } from "./optimize-result";

const OPTIMIZED_MIME = "image/webp";

// INFO: `next.config.ts`'s `/emoticons` rewrite and jandh-emoticons both leave this path untouched, so a fixed `public/` path is safe to hardcode rather than route through `@/shared/config`.
const CORE_BASE_URL = "/ffmpeg";

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

let ffmpegPromise: Nullable<Promise<FFmpeg>> = null;

// WARN: `@ffmpeg/ffmpeg`'s worker holds one module-level core and does not serialize its own message handler, so concurrent `exec` calls on it are undefined behaviour.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);

  queue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

/**
 * WARN: The `@ffmpeg/ffmpeg` class and its wasm core are both `import()`ed here,
 * on first call, and cached at module scope — mirrors `canvas.ts`'s
 * `loadAvifEncoder`. A user who never sends an animated image must never fetch the
 * ~32MB core, so nothing above this function may import `@ffmpeg/ffmpeg` eagerly.
 */
function loadFfmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]);
    const ffmpeg = new FFmpeg();

    // INFO: Self-hosted rather than jsDelivr's default — `toBlobURL` re-wraps each file as a blob URL, which is the documented pattern for a module worker's same-origin constraint.
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    return ffmpeg;
  })();

  // WARN: A rejection is not kept — memoized, one failed fetch of the core disables the optimizer for the rest of the session, including after the network comes back.
  ffmpegPromise = ffmpegPromise.catch((error) => {
    ffmpegPromise = null;

    throw error;
  });

  return ffmpegPromise;
}

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

  return enqueue(async () => {
    try {
      const [loaded, size] = await Promise.all([loadFfmpeg(), measureSize(file, maxEdge)]);

      ffmpeg = loaded;
      ffmpeg.on("progress", handleProgress);

      await ffmpeg.writeFile(inputName, bytes);

      const exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        "-vf",
        `scale=${toEven(size.width)}:${toEven(size.height)}`,
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
        type: OPTIMIZED_MIME,
      });

      return optimized.size < file.size
        ? { file: optimized, width: toEven(size.width), height: toEven(size.height) }
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

// INFO: Chroma rounding insurance for `libwebp_anim`, cheap even though odd dimensions are not actually rejected.
// WARN: Floored at 2, never 0 — `scale=0:0` is "same as input" to ffmpeg while the row would still record a zero box, which is the one § 8.3. cannot reserve from.
function toEven(n: number): number {
  return Math.max(2, n % 2 === 0 ? n : n - 1);
}

function toOptimizedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.webp`;
}
