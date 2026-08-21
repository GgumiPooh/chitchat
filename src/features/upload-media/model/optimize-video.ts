import type { EncodeProgress, OptimizedMedia } from "./optimize-result";
import { runVideoConversion } from "./optimize-video-core";
import { optimizeVideoOffThread } from "./video-worker-client";

export {
  bitrateCeilingFor,
  VIDEO_BITRATE_CEILING_1080P,
  VIDEO_BITRATE_CEILING_720P,
  VIDEO_BITRATE_CEILING_SD,
  VIDEO_MAX_LONG_EDGE,
} from "./optimize-video-core";

/**
 * REQUIREMENTS.md § 9. Re-encodes a chat-attached video's picture down to
 * policy, ahead of the upload pipeline. The actual conversion
 * (`runVideoConversion`) runs on `video-encoder.worker.ts` so the potentially
 * minutes-long encode never blocks the UI thread.
 *
 * WARN: Falls back to running `runVideoConversion` on the main thread itself
 * if the worker cannot be created or fails — `runVideoConversion` never
 * throws, so this still honors the "must never fail an upload" contract.
 */
export async function optimizeVideo(
  file: File,
  onProgress?: EncodeProgress,
): Promise<OptimizedMedia> {
  try {
    return await optimizeVideoOffThread(file, onProgress);
  } catch {
    return enqueueFallback(() => runVideoConversion(file, onProgress));
  }
}

// WARN: Serialized, because a worker-level failure rejects every request in flight at once — a bubble of videos would otherwise run that many full re-encodes on the main thread in parallel, which is the freeze the worker exists to prevent, multiplied.
let fallbackQueue: Promise<unknown> = Promise.resolve();

function enqueueFallback<T>(task: () => Promise<T>): Promise<T> {
  const run = fallbackQueue.then(task, task);

  fallbackQueue = run.catch(() => {});

  return run;
}
