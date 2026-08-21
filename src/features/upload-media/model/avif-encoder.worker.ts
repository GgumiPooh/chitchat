import { encodeAvif } from "./avif-encoder";

type AvifWorkerRequest = { imageData: ImageData; quality: number; id: number };

type AvifWorkerResponse = { buffer: ArrayBuffer; id: number } | { error: string; id: number };

// WARN: Cast rather than a `webworker` lib reference — this project has no worker `tsconfig`, and `lib: ["dom", …]` already gives `MessageEvent` the shape needed here without redeclaring `self` against `webworker`, which conflicts with `dom`'s own `Window` self.
const context = self as unknown as Worker;

// WARN: `./avif-encoder`, never `@jsquash/avif/encode` — that entry feature-detects threads and pulls `avif_enc_mt.js`, which carries a worker of its own and deadlocks a Turbopack production build with no error and no progress.
context.onmessage = async ({ data }: MessageEvent<AvifWorkerRequest>) => {
  const { imageData, quality, id } = data;

  try {
    const buffer = await encodeAvif(imageData, quality);

    context.postMessage({ id, buffer } satisfies AvifWorkerResponse, [buffer]);
  } catch (error) {
    context.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies AvifWorkerResponse);
  }
};
