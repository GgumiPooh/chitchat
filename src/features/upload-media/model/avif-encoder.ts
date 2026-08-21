import type { Nullable } from "@/shared/lib";
import { defaultOptions } from "@jsquash/avif/meta.js";
import { initEmscriptenModule } from "@jsquash/avif/utils.js";

type EncoderModule = {
  encode: (
    data: Uint8Array,
    width: number,
    height: number,
    options: Record<string, unknown>,
  ) => Nullable<Uint8Array>;
};

let modulePromise: Nullable<Promise<EncoderModule>> = null;

/**
 * REQUIREMENTS.md § 9. `@jsquash/avif`'s single-threaded codec, reached directly
 * rather than through the package's own `encode` entry.
 *
 * WARN: That entry feature-detects `threads()` and imports `avif_enc_mt.js`, which
 * carries a worker of its own — and a Turbopack production build **deadlocks** on
 * analysing it, with no error and no progress. Nothing is lost by skipping it: the
 * threaded codec needs cross-origin isolation, which this app deliberately does not
 * have (`CLAUDE.md § 4.2.1.` — COEP would break the `/emoticons` rewrite and the R2
 * redirects), so that branch could never have run here anyway.
 */
function loadEncoder(): Promise<EncoderModule> {
  modulePromise ??= import("@jsquash/avif/codec/enc/avif_enc.js").then((codec) =>
    initEmscriptenModule(codec.default),
  ) as Promise<EncoderModule>;

  // WARN: A rejection is not kept — memoized, one failed chunk fetch disables AVIF for the rest of the session, including after the network comes back.
  modulePromise = modulePromise.catch((error: unknown) => {
    modulePromise = null;

    throw error;
  });

  return modulePromise;
}

/** Encodes one frame as AVIF at `quality` (0–100), throwing when the encoder cannot answer. */
export async function encodeAvif(data: ImageData, quality: number): Promise<ArrayBuffer> {
  const encoder = await loadEncoder();
  const output = encoder.encode(new Uint8Array(data.data.buffer), data.width, data.height, {
    ...defaultOptions,
    quality,
  });

  if (!output) {
    throw new Error("avif encode failed");
  }

  return new Uint8Array(output).buffer;
}
