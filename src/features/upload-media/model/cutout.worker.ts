import { matteImage, type CutoutModel, type CutoutProgress } from "./cutout-runtime";

type CutoutWorkerRequest = { imageData: ImageData; kind: CutoutModel; id: number };

export type CutoutWorkerResponse =
  | { kind: "progress"; progress: CutoutProgress; id: number }
  | { kind: "alpha"; alpha: Uint8Array; id: number }
  | { kind: "error"; error: string; id: number };

// WARN: `avif-encoder.worker.ts`'s cast, and for its reason — this project has no worker `tsconfig`, and referencing `webworker` conflicts with `dom`'s own `self`.
const context = self as unknown as Worker;

// WARN: Requests are answered one at a time by the queue in `cutout-worker-client.ts`, not here. A second `matteImage` entered while the first is mid-inference doubles the peak allocation of a 109MB model, which is what takes an iOS tab down.
context.onmessage = async ({ data }: MessageEvent<CutoutWorkerRequest>) => {
  const { imageData, kind, id } = data;

  try {
    const alpha = await matteImage(imageData, kind, (progress) =>
      context.postMessage({ kind: "progress", progress, id } satisfies CutoutWorkerResponse),
    );

    // WARN: `alpha.buffer` is transferred, so nothing here may touch it afterwards.
    context.postMessage({ kind: "alpha", alpha, id } satisfies CutoutWorkerResponse, [
      alpha.buffer as ArrayBuffer,
    ]);
  } catch (error) {
    context.postMessage({
      kind: "error",
      error: error instanceof Error ? error.message : String(error),
      id,
    } satisfies CutoutWorkerResponse);
  }
};
