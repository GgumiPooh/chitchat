import { AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";

/**
 * REQUIREMENTS.md § 13.4.2. Which matting model a frame goes to. A still takes
 * RMBG-1.4 — 96MB at fp16, a fixed 1024² input, and the better matte on anything. A
 * video frame takes MODNet at 384², which is ~14× cheaper on wasm and is what makes
 * sixty frames affordable on the phone; it is a portrait model, so it holds on
 * people and pets and reaches for the branch under a bird.
 *
 * WARN: BiRefNet is the better matte and was measured out of reach on both backends,
 * so do not reach for it again without re-reading § 13.4.2. Its `_lite` export
 * exhausts the wasm heap at the 1024² it is frozen at, every BiRefNet asks 11 storage
 * buffers of a WebGPU stage that allows 10, and the 512² export that does run is
 * 464MB an iPhone never finishes loading.
 *
 * WARN: Tiling several frames into RMBG's 1024² was measured and rejected (§ 13.4.2.):
 * a saliency model mattes the most prominent tile and drops the rest.
 */
export type CutoutModel = "still" | "video";

// WARN: fp16 and never `auto`, which resolves to fp32 — the same weights at twice the bytes, since the wasm backend takes fp16 through inserted casts rather than refusing it.
const MODELS: Record<CutoutModel, { dtype: "fp16"; id: string }> = {
  still: { id: "briaai/RMBG-1.4", dtype: "fp16" },
  video: { id: "Xenova/modnet", dtype: "fp16" },
};

/** What a caller is waiting on, since the download and the inference are minutes and seconds apart in cost. */
export type CutoutProgress =
  | { phase: "fetching"; loaded: number; total: number }
  | { phase: "starting" }
  | { phase: "matting" };

type Session = {
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
};

const sessions = new Map<CutoutModel, Promise<Session>>();

let isConfigured = false;

/**
 * WARN: Set before the first `from_pretrained` and never after — the runtime reads
 * these once while resolving its backend, so a later write is silently ignored and
 * the loader goes to the hub instead of to `public/cutout`.
 *
 * WARN: `allowRemoteModels = false` is the load-bearing half. `AGENTS.md § 4.2.1.`
 * admits two off-origin fetches and this is neither; left on, a cache miss reaches
 * huggingface.co and works in development, which is exactly how it would ship.
 */
function configure() {
  if (isConfigured) {
    return;
  }

  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/cutout/models/";
  const { wasm } = env.backends.onnx;

  // WARN: A hard failure rather than a skipped assignment. `wasmPaths` left unset falls back to a jsDelivr URL — which works, and is the third off-origin fetch `AGENTS.md § 4.2.1.` says there is not.
  if (!wasm) {
    throw new Error("the onnx wasm backend is unavailable");
  }

  wasm.wasmPaths = "/cutout/onnx/";
  isConfigured = true;
}

/**
 * The loaded model, kept for the session.
 *
 * WARN: The promise is cached, not the resolved pair — two screens opening at once
 * would otherwise each fetch 109MB. A rejection clears it so a retry is possible.
 */
export function loadCutoutModel(
  kind: CutoutModel,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<Session> {
  const cached = sessions.get(kind);

  if (cached) {
    return cached;
  }

  configure();

  const { dtype, id } = MODELS[kind];
  const session = Promise.all([
    AutoModel.from_pretrained(id, {
      dtype,
      progress_callback: (event: { status: string; loaded?: number; total?: number }) => {
        if (event.status === "progress" && event.total) {
          onProgress?.({ phase: "fetching", loaded: event.loaded ?? 0, total: event.total });
        }
      },
    }),
    AutoProcessor.from_pretrained(id),
  ])
    .then(([model, processor]) => ({ model, processor }))
    .catch((error: unknown) => {
      sessions.delete(kind);

      throw error;
    });

  sessions.set(kind, session);

  return session;
}

/**
 * One alpha matte for `image`, at the image's own size.
 *
 * INFO: Returns the matte alone rather than a composited picture — the caller owns
 * the pixels it was drawn from, so a toggled-off cutout costs nothing to undo and
 * the § 13.4.2. preview can cross-fade between the two.
 */
export async function matteImage(
  image: ImageData,
  kind: CutoutModel,
  onProgress?: (progress: CutoutProgress) => void,
): Promise<Uint8Array> {
  const { model, processor } = await loadCutoutModel(kind, onProgress);

  onProgress?.({ phase: "matting" });

  const source = new RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 4);
  const { pixel_values } = await processor(source.rgb());
  // WARN: The tensor names are read off the session rather than written out. Every export names them differently — RMBG-1.4 uses `input`/`output` where BiRefNet uses `input_image`/`output_image` — and a hardcoded pair turns a model swap into an `OrtRun` failure nothing here could explain.
  const output = await model({ [model.sessions.model.inputNames[0]]: pixel_values });
  const coverage = output[model.sessions.model.outputNames[0]];
  /**
   * WARN: No `sigmoid()` here, and its absence is load-bearing. **Both exports end in
   * one** — RMBG's output node is literally named `Sigmoid…`, and MODNet answers
   * [0, 1] the same way — so the tensor is already coverage. Applying a second one
   * squashes the whole matte into [sigmoid(0), sigmoid(1)] = [0.5, 0.731], which
   * reaches the alpha channel as [127, 186]: every cutout comes out uniformly
   * half-transparent, edges included, and reads as a *soft model* rather than as a
   * bug. That is exactly how it was first shipped and measured. BiRefNet's export
   * does **not** end in one, so a model swap has to check the graph rather than
   * copy this line.
   */
  const matte = await RawImage.fromTensor(coverage[0].mul(255).to("uint8")).resize(
    image.width,
    image.height,
  );

  return new Uint8Array(matte.data.buffer, matte.data.byteOffset, matte.data.byteLength);
}
