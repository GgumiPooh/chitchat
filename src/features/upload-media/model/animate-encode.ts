import { MAX_EMOTICON_IMAGE_SIZE } from "@/shared/config";
import { randomId, type Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { enqueueFfmpeg, loadFfmpeg, releaseFfmpeg } from "./ffmpeg-runtime";
import type { MattedFrame } from "./matte-video";
import { ANIMATION_MIME } from "./optimize-animation";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";

/**
 * WARN: REQUIREMENTS.md § 13.4.1. Tried in order until one lands under
 * `MAX_EMOTICON_IMAGE_SIZE`, so a busy clip is degraded rather than refused. Each
 * step is a whole re-encode, which is why the first is already conservative — 15fps
 * is smooth for a gesture and half the frames of the source it was cut from.
 */
export const ATTEMPTS = [
  { fps: 15, quality: 75 },
  { fps: 12, quality: 60 },
  { fps: 10, quality: 45 },
] as const;

/**
 * REQUIREMENTS.md § 13.4.2. A cut-out clip starts a rung lower, because every frame
 * it has is an inference on the phone — the matte is taken once at the top rung and
 * the lower ones drop frames from it rather than matting again.
 *
 * WARN: Still lossy. Lossless was measured at 17MB for 72 frames of 420px footage,
 * which no rung brings under `MAX_EMOTICON_IMAGE_SIZE`; libwebp codes the alpha
 * plane losslessly whatever the quality, so the edge the matte drew survives.
 */
export const CUTOUT_ATTEMPTS = [
  { fps: 12, quality: 75 },
  { fps: 10, quality: 60 },
  { fps: 8, quality: 45 },
] as const;

// INFO: The share of the bar the matte takes — sixty inferences against one encode, so most of it.
export const MATTE_SHARE = 0.8;

// INFO: `libwebpenc_common.c`'s max (0-6). A video-derived animation is the one encode here big enough for the smaller default to cost real bytes.
const COMPRESSION_LEVEL = 6;

// INFO: ffmpeg says why it refused in its last few lines, and nothing else in the browser can answer that question afterwards.
const LOG_TAIL_LINES = 12;

// INFO: The counter in ffmpeg's own stats line, which is the only thing that moves while an animation is being built.
const FRAME_COUNT = /frame=\s*(\d+)/;

/** Which of the three things went wrong, since only one of them has an action for the user. */
export type AnimationFailure = "decode" | "encode" | "oversize";

type EncodedFrame = { color: Uint8Array; alpha: Uint8Array };

export type EncodeSource =
  { kind: "clip"; bytes: Uint8Array } | { kind: "frames"; frames: EncodedFrame[]; fps: number };

export type EncodeAnimationOptions = {
  /** Which ladder to walk and which share of the bar is left — a `frames` source is not on its own the answer, since § 13.4.1.'s animation splits into two sequences whether or not it was matted. */
  matted?: boolean;
};

export class AnimateVideoError extends Error {
  constructor(
    readonly failure: AnimationFailure,
    message: string,
  ) {
    super(message);
    this.name = "AnimateVideoError";
  }
}

/**
 * REQUIREMENTS.md § 13.4.1. Walks the fps/quality ladder until an encode lands under
 * `MAX_EMOTICON_IMAGE_SIZE`, and answers the animated WebP an emoticon's animated slot holds.
 *
 * WARN: Not `optimizeAnimation`, which falls back to the file it was given whenever
 * a re-encode would not help — a fallback here would hand the emoticon slot an MP4.
 * This throws instead, and the caller says so.
 */
export async function encodeAnimation(
  file: File,
  source: EncodeSource,
  size: { width: number; height: number },
  clipSeconds: number,
  onProgress?: EncodeProgress,
  { matted = false }: EncodeAnimationOptions = {},
): Promise<OptimizedMedia> {
  const attempts = matted ? CUTOUT_ATTEMPTS : ATTEMPTS;
  const seconds = source.kind === "frames" ? source.frames.length / source.fps : clipSeconds;

  try {
    for (const attempt of attempts) {
      // WARN: Each rung reports its own 0 → 1 rather than a slice of the ladder. Spread across every rung, the common case — one encode, which is what almost every clip takes — could never fill more than a third of the bar.
      const frames = Math.max(1, Math.round(seconds * attempt.fps));
      const encoded = await encode(file, source, size, attempt, frames, (ratio) =>
        onProgress?.(matted ? MATTE_SHARE + ratio * (1 - MATTE_SHARE) : ratio),
      );

      if (encoded.size <= MAX_EMOTICON_IMAGE_SIZE) {
        return { file: encoded, ...size };
      }
    }

    throw new AnimateVideoError("oversize", "every rung exceeded the emoticon size cap");
  } finally {
    // INFO: After the whole ladder, never per rung — the rungs share one loaded core.
    releaseFfmpeg();
  }
}

/** The matted pairs as ffmpeg's virtual FS takes them. */
export async function toEncodedFrames(matted: MattedFrame[]): Promise<EncodedFrame[]> {
  return Promise.all(matted.map(toEncodedFrame));
}

async function toEncodedFrame({ color, alpha }: MattedFrame): Promise<EncodedFrame> {
  const [colorBytes, alphaBytes] = await Promise.all([color.arrayBuffer(), alpha.arrayBuffer()]);

  return { color: new Uint8Array(colorBytes), alpha: new Uint8Array(alphaBytes) };
}

/**
 * WARN: `-c:v libwebp_anim`, never plain `libwebp` — the latter also emits an
 * animated file but encodes every frame independently, losing libwebp's inter-frame
 * optimization while still "working".
 *
 * WARN: Progress is counted off ffmpeg's `frame=` stats line and **not** its own
 * `progress` event. That event is the output packet's timestamp over the input's
 * duration, and `libwebp_anim` holds every frame until it assembles the animation in
 * one packet at the end — so it reports 0 for the whole encode and then finishes.
 */
async function encode(
  file: File,
  source: EncodeSource,
  size: { width: number; height: number },
  { fps, quality }: (typeof ATTEMPTS | typeof CUTOUT_ATTEMPTS)[number],
  frames: number,
  onProgress: EncodeProgress,
): Promise<File> {
  const prefix = randomId();
  const toColorName = (index: number | string) => `${prefix}-c-${index}.jpg`;
  const toAlphaName = (index: number | string) => `${prefix}-a-${index}.png`;
  const inputNames =
    source.kind === "clip"
      ? [`${prefix}-input`]
      : source.frames.flatMap((_, index) => {
          const padded = String(index).padStart(4, "0");

          return [toColorName(padded), toAlphaName(padded)];
        });
  const rungFilters = [`fps=${fps}`, `scale=${size.width}:${size.height}`];
  // INFO: image2 takes a printf pattern, so each sequence is one input; `alphamerge` takes the second as the first's alpha plane.
  const filterArgs =
    source.kind === "clip"
      ? ["-i", inputNames[0], "-vf", rungFilters.join(",")]
      : [
          ...["-framerate", `${source.fps}`, "-i", toColorName("%04d")],
          ...["-framerate", `${source.fps}`, "-i", toAlphaName("%04d")],
          ...["-filter_complex", `[0:v][1:v]alphamerge,${rungFilters.join(",")}`],
        ];
  const outputName = `${prefix}-output.webp`;
  const tail: string[] = [];
  const handleLog = ({ message }: { message: string }) => {
    tail.push(message);
    tail.splice(0, tail.length - LOG_TAIL_LINES);

    const encoded = FRAME_COUNT.exec(message)?.[1];

    if (encoded) {
      onProgress(Math.min(1, Number(encoded) / frames));
    }
  };

  let ffmpeg: Nullable<FFmpeg> = null;

  return enqueueFfmpeg(async () => {
    try {
      ffmpeg = await loadFfmpeg();
      ffmpeg.on("log", handleLog);

      if (source.kind === "clip") {
        await ffmpeg.writeFile(inputNames[0], source.bytes);
      } else {
        for (const [index, frame] of source.frames.entries()) {
          await ffmpeg.writeFile(inputNames[index * 2], frame.color);
          await ffmpeg.writeFile(inputNames[index * 2 + 1], frame.alpha);
        }
      }

      const exitCode = await ffmpeg.exec([
        ...filterArgs,
        "-c:v",
        "libwebp_anim",
        "-lossless",
        "0",
        "-quality",
        `${quality}`,
        "-compression_level",
        `${COMPRESSION_LEVEL}`,
        "-loop",
        "0",
        "-an",
        // INFO: Forced on, because the stats line is the progress signal — a build that suppressed it for a non-tty stderr would leave the bar indeterminate for the whole encode.
        "-stats",
        outputName,
      ]);

      // WARN: A refusal ends the ladder rather than stepping down it. ffmpeg answers the same way to the same input, so the remaining rungs are tens of seconds of wasm spent reaching the failure the first one already reported.
      if (exitCode !== 0) {
        throw new AnimateVideoError("encode", tail.join("\n"));
      }

      const data = await ffmpeg.readFile(outputName);

      if (typeof data === "string") {
        throw new AnimateVideoError(
          "encode",
          "the encode wrote text where the animation should be",
        );
      }

      // WARN: `data`'s buffer is typed `ArrayBufferLike`, which admits `SharedArrayBuffer` — `File` only accepts `ArrayBuffer`, so a fresh copy is the cast.
      return new File([new Uint8Array(data)], toAnimatedName(file.name), { type: ANIMATION_MIME });
    } finally {
      ffmpeg?.off("log", handleLog);
      // INFO: The instance is cached and reused by the next call, so its virtual FS is cleared per-call rather than per-load.
      await Promise.allSettled([...inputNames, outputName].map((name) => ffmpeg?.deleteFile(name)));
    }
  });
}

function toAnimatedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.webp`;
}
