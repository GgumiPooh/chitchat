import type { Nullable } from "@/shared/lib";
import type { CutoutModel, CutoutProgress } from "./cutout-runtime";
import type { CutoutWorkerResponse } from "./cutout.worker";

export type { CutoutModel, CutoutProgress } from "./cutout-runtime";

type PendingRequest = {
  resolve: (alpha: Uint8Array) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: CutoutProgress) => void;
};

let worker: Nullable<Worker> = null;
let nextId = 0;
// WARN: One entry at most. `queue` below is what keeps it that way, and the 109MB model is why — two inferences in flight hold two sets of intermediates.
const pending = new Map<number, PendingRequest>();
let queue: Promise<unknown> = Promise.resolve();

// INFO: `avif-worker-client.ts`'s shape — one worker for the session, request-keyed. Here it also holds the loaded model, so a second worker would re-fetch the weights rather than merely re-fetch a codec.
function ensureWorker(): Worker {
  if (worker) {
    return worker;
  }

  const instance = new Worker(new URL("./cutout.worker.ts", import.meta.url), { type: "module" });

  instance.onmessage = ({ data }: MessageEvent<CutoutWorkerResponse>) => {
    const request = pending.get(data.id);

    if (!request) {
      return;
    }

    if (data.kind === "progress") {
      request.onProgress?.(data.progress);

      return;
    }

    pending.delete(data.id);

    if (data.kind === "error") {
      request.reject(new Error(data.error));
    } else {
      request.resolve(data.alpha);
    }
  };

  // WARN: A worker-level failure never reaches the handler above, so every request in flight would hang forever without this.
  instance.onerror = (event) => {
    console.error("[cutout] the segmentation worker failed", event.message);
    pending.forEach((request) => request.reject(event.error ?? new Error("cutout worker failed")));
    pending.clear();
    instance.terminate();
    worker = null;
  };

  worker = instance;

  return worker;
}

/**
 * REQUIREMENTS.md § 13.4.2. The alpha matte for one frame, computed off this thread.
 *
 * WARN: Transfers `imageData.data.buffer`, which detaches it here — safe only
 * because every caller hands over a fresh `getImageData`, and a retry must take a
 * new one rather than reusing this.
 *
 * WARN: Serialised behind whatever is already running. § 13.4.2.'s video pass mattes
 * every frame of a clip, and firing those concurrently is several models' worth of
 * intermediates inside one iOS tab.
 */
export function matteOffThread(
  imageData: ImageData,
  kind: CutoutModel,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<Uint8Array> {
  const run = queue.then(
    () =>
      new Promise<Uint8Array>((resolve, reject) => {
        const instance = ensureWorker();
        const id = nextId++;

        pending.set(id, { resolve, reject, onProgress });
        instance.postMessage({ id, kind, imageData }, [imageData.data.buffer]);
      }),
  );

  // WARN: The queue follows the settled run rather than the run itself, or one rejection would poison every request behind it.
  queue = run.catch(() => undefined);

  return run;
}

// WARN: Never `terminate()` this worker to give its heap back. Tried on an iPhone 13 mini: the page reloaded the moment it ran, with RMBG's heap and with MODNet's, while two simulators survived it — see REQUIREMENTS.md § 13.4.2.
