import type { Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";

// INFO: `next.config.ts`'s `/emoticons` rewrite and jandh-emoticons both leave this path untouched, so a fixed `public/` path is safe to hardcode rather than route through `@/shared/config`.
const CORE_BASE_URL = "/ffmpeg";

let ffmpegPromise: Nullable<Promise<FFmpeg>> = null;

// WARN: `@ffmpeg/ffmpeg`'s worker holds one module-level core and does not serialize its own message handler, so concurrent `exec` calls on it are undefined behaviour.
let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after every other ffmpeg task this module has been handed. */
export function enqueueFfmpeg<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);

  queue = run.then(
    () => undefined,
    () => undefined,
  );

  return run;
}

/**
 * WARN: The `@ffmpeg/ffmpeg` class is `import()`ed here, on first call, and cached
 * at module scope — mirrors `canvas.ts`'s `loadAvifEncoder`. A user who never
 * encodes an animation must never fetch the ~32MB core, so nothing above this
 * function may import `@ffmpeg/ffmpeg` eagerly.
 *
 * WARN: `classWorkerURL` is load-bearing and this silently did nothing without it.
 * The package's own worker ends in `import(coreURL)`, a specifier Turbopack cannot
 * resolve statically — the bundled copy Next builds throws `Cannot find module as
 * expression is too dynamic`, so **every** encode fell back and `optimizeAnimation`
 * swallowed it. `scripts/generate-ffmpeg-core.ts` copies that worker out unbundled.
 *
 * WARN: Plain URLs, never `toBlobURL`. That helper exists for a **cross-origin**
 * core, and these are served from `public/` — wrapping them pulls the whole 32MB
 * through the main thread as a blob before the worker fetches it again.
 *
 * WARN: Absolute against `location.origin`, and a root-relative path is not enough.
 * `FFmpeg.load` resolves `classWorkerURL` with `new URL(url, import.meta.url)`, and
 * Turbopack leaves `import.meta.url` as the module's own `file://` path — so
 * `/ffmpeg/worker.js` becomes `file:///ffmpeg/worker.js`, which the `Worker`
 * constructor refuses as cross-origin.
 */
export function loadFfmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const ffmpeg = new FFmpeg();

    const base = `${location.origin}${CORE_BASE_URL}`;

    await ffmpeg.load({
      classWorkerURL: `${base}/worker.js`,
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`,
    });

    return ffmpeg;
  })();

  // WARN: A rejection is not kept — memoized, one failed fetch of the core disables the optimizer for the rest of the session, including after the network comes back.
  ffmpegPromise = ffmpegPromise.catch((error: unknown) => {
    ffmpegPromise = null;
    // WARN: `optimizeAnimation` answers a load failure by uploading the original, so without this the core failing to load is invisible — which is exactly how the Turbopack rewrite above went unnoticed.
    console.error("[ffmpeg] the core could not be loaded", error);

    throw error;
  });

  return ffmpegPromise;
}

// INFO: Chroma rounding insurance for `libwebp_anim`, cheap even though odd dimensions are not actually rejected.
// WARN: Floored at 2, never 0 — `scale=0:0` is "same as input" to ffmpeg while the row would still record a zero box, which is the one § 8.3. cannot reserve from.
export function toEvenEdge(value: number): number {
  return Math.max(2, value % 2 === 0 ? value : value - 1);
}
