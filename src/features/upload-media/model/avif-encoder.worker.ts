import type { Nullable } from "@/shared/lib";

type AvifEncode = (data: ImageData, options: { quality: number }) => Promise<ArrayBuffer>;

type AvifWorkerRequest = { imageData: ImageData; quality: number; id: number };

type AvifWorkerResponse = { buffer: ArrayBuffer; id: number } | { error: string; id: number };

// WARN: Cast rather than a `webworker` lib reference — this file lives inside a project with no dedicated worker `tsconfig`, and `lib: ["dom", ...]` already gives `Worker`/`MessageEvent` the shapes this file needs without redeclaring `self` against `webworker`, which conflicts with `dom`'s own `Window` self.
const context = self as unknown as Worker;

let avifEncoderPromise: Nullable<Promise<AvifEncode>> = null;

// INFO: Ported from `canvas.ts` — the wasm now loads inside this worker instead of the main thread.
function loadAvifEncoder(): Promise<AvifEncode> {
  avifEncoderPromise ??= import("@jsquash/avif/encode").then((module) => module.default);

  // WARN: A rejection is not kept — memoized, one failed chunk fetch disables AVIF for the rest of the session, including after the network comes back.
  avifEncoderPromise = avifEncoderPromise.catch((error) => {
    avifEncoderPromise = null;

    throw error;
  });

  return avifEncoderPromise;
}

context.onmessage = async ({ data }: MessageEvent<AvifWorkerRequest>) => {
  const { imageData, quality, id } = data;

  try {
    const encode = await loadAvifEncoder();
    const buffer = await encode(imageData, { quality });

    context.postMessage({ id, buffer } satisfies AvifWorkerResponse, [buffer]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    context.postMessage({ id, error: message } satisfies AvifWorkerResponse);
  }
};
