import type { Nullable } from "@/shared/lib";

type PendingRequest = {
  resolve: (buffer: ArrayBuffer) => void;
  reject: (error: unknown) => void;
};

type AvifWorkerResponse = { buffer: ArrayBuffer; id: number } | { error: string; id: number };

let worker: Nullable<Worker> = null;
let nextId = 0;
const pending = new Map<number, PendingRequest>();

// INFO: One worker for the whole session, request-keyed — the send path uploads a bubble's attachments through a bounded pool, so several encodes can be in flight, and a worker per encode would pay the ~1MB wasm load again each time.
function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  const instance = new Worker(new URL("./avif-encoder.worker.ts", import.meta.url), {
    type: "module",
  });

  instance.onmessage = ({ data }: MessageEvent<AvifWorkerResponse>) => {
    const request = pending.get(data.id);

    if (!request) {
      return;
    }

    pending.delete(data.id);

    if ("error" in data) {
      request.reject(new Error(data.error));
    } else {
      request.resolve(data.buffer);
    }
  };

  // WARN: A worker-level failure (its module script fails to fetch, for instance) never reaches the handler above, so every request still in flight would hang forever without this — reject them and let the next call spawn a fresh worker.
  instance.onerror = (event) => {
    pending.forEach((request) => request.reject(event.error ?? new Error("avif worker failed")));
    pending.clear();
    worker = null;
  };

  worker = instance;

  return worker;
}

/** Runs the AVIF wasm encode on `avif-encoder.worker.ts` instead of the main thread. */
export function encodeAvifOffThread(imageData: ImageData, quality: number): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const instance = ensureWorker();
    const id = nextId++;

    pending.set(id, { resolve, reject });
    // WARN: Transfers `imageData.data.buffer` rather than copying it — safe because `context.getImageData` in `canvas.ts` always returns a fresh copy, so nothing on the main thread still holds this buffer once it posts.
    instance.postMessage({ id, imageData, quality }, [imageData.data.buffer]);
  });
}
