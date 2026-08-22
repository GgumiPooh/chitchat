import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
// WARN: The bare module by a relative path, never the `@/shared/lib` barrel — `generate-holidays.ts`'s own precedent. This script runs in `predev`/`build` with no env loaded, and the barrel pulls `@/shared/config`, whose top-level `snowflakeSchema` reads a `SNOWFLAKE_PATTERN` that a circular import leaves undefined — which crashes the build here rather than in the app.
import { A_MINUTE, A_SECOND } from "../src/shared/lib/date/time";

// WARN: The model is gitignored, so every cold build and every teammate's first `pnpm dev` re-fetches ~109MB from huggingface.co — a single 429, 5xx or dropped connection there used to break the whole build at this step with no retry.
const FETCH_ATTEMPTS = 4;

const RETRY_BACKOFF = 3 * A_SECOND;

// INFO: A whole attempt, not a stall detector — 96MB over a slow connection is legitimately minutes, and the retry above is what covers a genuinely hung socket.
const FETCH_TIMEOUT = 5 * A_MINUTE;

/**
 * WARN: Resolved through the real path of `@huggingface/transformers`, never as a
 * literal `node_modules/onnxruntime-web`. pnpm links the runtime beside its dependent
 * inside the store, so the flat path does not exist here — and `../../` off the
 * resolved package lands on the right directory under a hoisted install too.
 */
async function toOrtDir(): Promise<string> {
  const pkg = await realpath(
    path.join(process.cwd(), "node_modules", "@huggingface", "transformers"),
  );

  return path.join(pkg, "..", "..", "onnxruntime-web", "dist");
}

/**
 * WARN: All four variants, not the one this machine happens to pick. onnxruntime-web
 * chooses at runtime from what the engine offers — `jsep` for WebGPU, `jspi` where
 * stack switching exists, `asyncify` for the WebKit that has neither — and a missing
 * variant surfaces as `no available backend found`, not as a 404 anyone can read.
 *
 * INFO: ~77MB on disk and one variant per visitor, since only the chosen pair is fetched.
 */
const ORT_FILES = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jspi.mjs",
  "ort-wasm-simd-threaded.jspi.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

/**
 * INFO: REQUIREMENTS.md § 13.4.2. `transformers.js` resolves a local model at `${localModelPath}/${id}/${file}`, so the id is a directory layout rather than a name.
 *
 * WARN: BiRefNet was measured and rejected, and the reasons are not ones a newer
 * export fixes by itself — `BiRefNet_lite` at its fixed 1024² exhausts the wasm heap
 * outright, and every BiRefNet asks 11 storage buffers of a WebGPU stage that allows
 * 10. The 512² export runs, and is 464MB an iPhone will not finish loading.
 */
// WARN: `model_fp16.onnx`, not `model.onnx` — the same weights at half the bytes, and the wasm backend takes fp16 through inserted casts rather than refusing it.
// INFO: § 13.4.2. MODNet is the video model — 13MB and ~14× cheaper per frame than RMBG on wasm. Its processor is written here rather than fetched, because the hub's asks 512² and the phone affords 384².
const MODELS = [
  {
    id: "briaai/RMBG-1.4",
    files: ["config.json", "preprocessor_config.json", "onnx/model_fp16.onnx"],
  },
  { id: "Xenova/modnet", files: ["config.json", "onnx/model_fp16.onnx"] },
];

const MODEL_REVISION = "main";

// WARN: WebKit reserves a *shared* memory's whole maximum up front, and iOS refuses the 4GB the glue asks for with the `RangeError: Out of memory` that surfaces as `no available backend found` — so the glue is rewritten to take the largest reservation the engine allows (see microsoft/onnxruntime#22086).
const WASM_MEMORY_ALLOCATION = "new WebAssembly.Memory({initial:256,maximum:65536,shared:!0})";

// INFO: 4GB, 2GB, 1GB, 512MB in 64KiB pages. RMBG needs more than the last rung, MODNet does not; a failed attempt reserves nothing.
const WASM_MAX_PAGES = [65536, 32768, 16384, 8192];

const WASM_MEMORY_PROBE = `(()=>{let e;for(const m of [${WASM_MAX_PAGES}]){try{return new WebAssembly.Memory({initial:256,maximum:m,shared:!0})}catch(r){e=r}}throw e})()`;

const VIDEO_MATTE_EDGE = 384;

const VIDEO_PREPROCESSOR = {
  do_normalize: true,
  do_pad: false,
  do_rescale: true,
  do_resize: true,
  image_mean: [0.5, 0.5, 0.5],
  image_std: [0.5, 0.5, 0.5],
  feature_extractor_type: "ImageFeatureExtractor",
  resample: 2,
  rescale_factor: 1 / 255,
  size: { shortest_edge: VIDEO_MATTE_EDGE },
  size_divisibility: 32,
};

const OUTPUT_DIR = path.join(process.cwd(), "public", "cutout");

function toModelDir(id: string): string {
  return path.join(OUTPUT_DIR, "models", ...id.split("/"));
}

async function main() {
  const ortDir = await toOrtDir();

  await mkdir(path.join(OUTPUT_DIR, "onnx"), { recursive: true });
  await Promise.all(ORT_FILES.map((file) => copyOrtFile(ortDir, file)));

  for (const { files, id } of MODELS) {
    for (const file of files) {
      await download(id, file);
    }
  }

  await writeFile(
    path.join(toModelDir("Xenova/modnet"), "preprocessor_config.json"),
    JSON.stringify(VIDEO_PREPROCESSOR, null, 2),
  );

  console.log(`Cutout runtime ready in ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

async function copyOrtFile(ortDir: string, file: string) {
  const source = path.join(ortDir, file);
  const target = path.join(OUTPUT_DIR, "onnx", file);

  if (!file.endsWith(".mjs")) {
    await copyFile(source, target);

    return;
  }

  const glue = await readFile(source, "utf8");

  // WARN: A hard failure rather than a silent copy — an upgraded glue that no longer matches would ship the 4GB reservation iOS refuses.
  if (glue.split(WASM_MEMORY_ALLOCATION).length !== 2) {
    throw new Error(`${file}: expected exactly one wasm memory allocation to patch`);
  }

  await writeFile(target, glue.replace(WASM_MEMORY_ALLOCATION, WASM_MEMORY_PROBE));
}

/**
 * WARN: A build-time fetch, never a runtime one. `AGENTS.md § 4.2.1.` admits exactly
 * two off-origin fetches from the browser and this is not one of them — the weights
 * are served from this origin, which is also what keeps them inside the Cache Storage
 * entry the app controls.
 */
async function download(id: string, file: string) {
  const target = path.join(toModelDir(id), file);
  const url = `https://huggingface.co/${id}/resolve/${MODEL_REVISION}/${file}`;
  const expected = await headEtag(url);

  // INFO: The weights are 109MB and this runs before every `dev` and `build`; re-fetching them on each is minutes of nothing.
  if (expected && (await sha256(target)) === expected) {
    return;
  }

  const response = await fetchWithRetry(url);

  if (!response.ok) {
    throw new Error(`${file}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`  fetched ${file}`);
}

/**
 * A fetch that survives the transient failures the hub answers a cold build with — a
 * 429 rate limit, a 5xx, or a connection dropped mid-transfer — rather than failing
 * the build on the first one.
 *
 * WARN: A retried GET re-downloads from the top; that is affordable here because it
 * is build-time and self-limited by the attempt count, and the alternative — a
 * Range resume — would have to trust a partial file the next `sha256` check is what
 * actually validates anyway.
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT) });

      // INFO: A 429 or 5xx is the hub asking to be retried; a 4xx is not, so it is returned for the caller to report.
      if (response.status !== 429 && response.status < 500) {
        return response;
      }

      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < FETCH_ATTEMPTS) {
      // INFO: Linear backoff — the hub's 429 clears in seconds and a dropped socket has no schedule to respect.
      await delay(RETRY_BACKOFF * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`fetch failed: ${url}`);
}

/**
 * The LFS pointer's own sha256, which the hub exposes as `x-linked-etag`.
 *
 * WARN: `redirect: "manual"`. The hub answers a 302 into its CDN, and the CDN's own
 * `etag` is the *storage* digest — a different 64-hex string that never matches the
 * file's sha256, so a followed redirect compares two unrelated hashes and re-fetches
 * 109MB on every `dev` and `build`.
 */
async function headEtag(url: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(url, { method: "HEAD", redirect: "manual" });
    const etag = response.headers.get("x-linked-etag") ?? response.headers.get("etag");
    const digest = etag?.replace(/^W\//, "").replaceAll('"', "");

    return digest && /^[0-9a-f]{64}$/.test(digest) ? digest : null;
  } catch {
    // INFO: A failed HEAD only costs the cache check — it must not fail the build before the GET below is even attempted.
    return null;
  }
}

async function sha256(file: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  } catch {
    return null;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
