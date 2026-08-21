import type { OptimizedMedia } from "./optimize-result";
import { runVideoConversion } from "./optimize-video-core";

type VideoWorkerRequest = { file: File; id: number };

type VideoWorkerResponse =
  | { type: "progress"; ratio: number; id: number }
  | { type: "result"; result: OptimizedMedia; id: number }
  | { type: "error"; error: string; id: number };

// WARN: Cast rather than a `webworker` lib reference — see `avif-encoder.worker.ts` for why.
const context = self as unknown as Worker;

context.onmessage = async ({ data }: MessageEvent<VideoWorkerRequest>) => {
  const { file, id } = data;

  try {
    const result = await runVideoConversion(file, (ratio) => {
      context.postMessage({ id, type: "progress", ratio } satisfies VideoWorkerResponse);
    });

    context.postMessage({ id, type: "result", result } satisfies VideoWorkerResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    context.postMessage({ id, type: "error", error: message } satisfies VideoWorkerResponse);
  }
};
