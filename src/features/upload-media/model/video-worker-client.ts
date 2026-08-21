import type { Nullable } from "@/shared/lib";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";

type PendingRequest = {
  resolve: (media: OptimizedMedia) => void;
  reject: (error: unknown) => void;
  onProgress?: EncodeProgress;
};

type VideoWorkerResponse =
  | { type: "progress"; ratio: number; id: number }
  | { type: "result"; result: OptimizedMedia; id: number }
  | { type: "error"; error: string; id: number };

let worker: Nullable<Worker> = null;
let nextId = 0;
const pending = new Map<number, PendingRequest>();

// INFO: One worker for the whole session, request-keyed — same reasoning as `avif-worker-client.ts`'s `ensureWorker`, sized for the send path's bounded upload pool.
function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  const instance = new Worker(new URL("./video-encoder.worker.ts", import.meta.url), {
    type: "module",
  });

  instance.onmessage = ({ data }: MessageEvent<VideoWorkerResponse>) => {
    const request = pending.get(data.id);

    if (!request) {
      return;
    }

    if (data.type === "progress") {
      request.onProgress?.(data.ratio);
      return;
    }

    pending.delete(data.id);

    if (data.type === "error") {
      request.reject(new Error(data.error));
    } else {
      request.resolve(data.result);
    }
  };

  // WARN: A worker-level failure never reaches the handler above, so every request still in flight would hang forever without this — reject them and let the next call spawn a fresh worker.
  instance.onerror = (event) => {
    pending.forEach((request) => request.reject(event.error ?? new Error("video worker failed")));
    pending.clear();
    worker = null;
  };

  worker = instance;

  return worker;
}

/** Runs `runVideoConversion` on `video-encoder.worker.ts` instead of the main thread. */
export function optimizeVideoOffThread(
  file: File,
  onProgress?: EncodeProgress,
): Promise<OptimizedMedia> {
  return new Promise((resolve, reject) => {
    const instance = ensureWorker();
    const id = nextId++;

    pending.set(id, { resolve, reject, onProgress });
    // WARN: `file` is cloned, not transferred — `File`/`Blob` are not transferable, and the caller may still hold onto it (e.g. for the fallback path) if this call is ever raced against one.
    instance.postMessage({ id, file });
  });
}
