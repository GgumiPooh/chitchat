import { MAX_EMOTICON_IMAGE_SIZE, MAX_EMOTICON_VIDEO_DURATION } from "@/shared/config";
import { A_SECOND, randomId, type Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { BlobSource, Input, MP4, QTFF, WEBM } from "mediabunny";
import { fitWithin } from "./canvas";
import { enqueueFfmpeg, loadFfmpeg, toEvenEdge } from "./ffmpeg-runtime";
import { matteVideoFrames, type MattedFrame } from "./matte-video";
import { ANIMATION_MIME } from "./optimize-animation";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";

/**
 * WARN: REQUIREMENTS.md § 13.4.1. Tried in order until one lands under
 * `MAX_EMOTICON_IMAGE_SIZE`, so a busy clip is degraded rather than refused. Each
 * step is a whole re-encode, which is why the first is already conservative — 15fps
 * is smooth for a gesture and half the frames of the source it was cut from.
 */
const ATTEMPTS = [
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
const CUTOUT_ATTEMPTS = [
  { fps: 12, quality: 75 },
  { fps: 10, quality: 60 },
  { fps: 8, quality: 45 },
] as const;

// INFO: The share of the bar the matte takes — sixty inferences against one encode, so most of it.
const MATTE_SHARE = 0.8;

// INFO: `trimVideo`'s list — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

// INFO: `libwebpenc_common.c`'s max (0-6). A video-derived animation is the one encode here big enough for the smaller default to cost real bytes.
const COMPRESSION_LEVEL = 6;

// INFO: ffmpeg says why it refused in its last few lines, and nothing else in the browser can answer that question afterwards.
const LOG_TAIL_LINES = 12;

// INFO: The counter in ffmpeg's own stats line, which is the only thing that moves while an animation is being built.
const FRAME_COUNT = /frame=\s*(\d+)/;

/** Which of the two things went wrong, since only one of them has an action for the user. */
export type AnimationFailure = "encode" | "oversize";

export type AnimateVideoOptions = {
  /** REQUIREMENTS.md § 13.4.2. Matte every frame before encoding. */
  cutout?: boolean;
};

type EncodedFrame = { color: Uint8Array; alpha: Uint8Array };

type EncodeSource =
  { kind: "clip"; bytes: Uint8Array } | { kind: "frames"; frames: EncodedFrame[]; fps: number };

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
 * REQUIREMENTS.md § 13.4.1. Turns a cut-down clip into the animated WebP an
 * emoticon's animated slot holds.
 *
 * WARN: Not `optimizeAnimation`, which falls back to the file it was given whenever
 * a re-encode would not help — a fallback here would hand the emoticon slot an MP4.
 * This throws instead, and the caller says so.
 *
 * WARN: `-c:v libwebp_anim`, never plain `libwebp` — the latter also emits an
 * animated file but encodes every frame independently, losing libwebp's inter-frame
 * optimization while still "working".
 *
 * WARN: Progress is counted off ffmpeg's `frame=` stats line and **not** its own
 * `progress` event. That event is the output packet's timestamp over the input's
 * duration, and `libwebp_anim` holds every frame until it assembles the animation in
 * one packet at the end — so it reports 0 for the whole encode and then finishes.
 */
export async function animateVideo(
  file: File,
  maxEdge: number,
  onProgress?: EncodeProgress,
  { cutout = false }: AnimateVideoOptions = {},
): Promise<OptimizedMedia> {
  const measured = await measureVideo(file);
  const fitted = fitWithin(measured.width, measured.height, maxEdge);
  const scaled = { width: toEvenEdge(fitted.width), height: toEvenEdge(fitted.height) };
  const attempts = cutout ? CUTOUT_ATTEMPTS : ATTEMPTS;
  // WARN: The clip's bytes are read only when it is the encode source. The cutout path never touches them, and reading a whole file into a buffer it discards is real memory on the iPhone this runs on.
  const source: EncodeSource = cutout
    ? await toMattedSource(file, attempts[0].fps, scaled, onProgress)
    : { kind: "clip", bytes: new Uint8Array(await file.arrayBuffer()) };
  const seconds = source.kind === "frames" ? source.frames.length / source.fps : measured.seconds;

  for (const attempt of attempts) {
    // WARN: Each rung reports its own 0 → 1 rather than a slice of the ladder. Spread across every rung, the common case — one encode, which is what almost every clip takes — could never fill more than a third of the bar.
    const frames = Math.max(1, Math.round(seconds * attempt.fps));
    const encoded = await encode(file, source, scaled, attempt, frames, (ratio) =>
      onProgress?.(cutout ? MATTE_SHARE + ratio * (1 - MATTE_SHARE) : ratio),
    );

    if (encoded.size <= MAX_EMOTICON_IMAGE_SIZE) {
      return { file: encoded, ...scaled };
    }
  }

  throw new AnimateVideoError("oversize", "every rung exceeded the emoticon size cap");
}

async function toMattedSource(
  file: File,
  fps: number,
  size: { width: number; height: number },
  onProgress?: EncodeProgress,
): Promise<EncodeSource> {
  const matted = await matteVideoFrames(file, fps, size, (ratio) =>
    onProgress?.(ratio * MATTE_SHARE),
  );
  const frames = await Promise.all(matted.map(toEncodedFrame));

  return { kind: "frames", frames, fps };
}

async function toEncodedFrame({ color, alpha }: MattedFrame): Promise<EncodedFrame> {
  const [colorBytes, alphaBytes] = await Promise.all([color.arrayBuffer(), alpha.arrayBuffer()]);

  return { color: new Uint8Array(colorBytes), alpha: new Uint8Array(alphaBytes) };
}

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
  // INFO: image2 takes a printf pattern, so each sequence is one input; `alphamerge` takes the second as the first's alpha plane.
  const filterArgs =
    source.kind === "clip"
      ? ["-i", inputNames[0], "-vf", `fps=${fps},scale=${size.width}:${size.height}`]
      : [
          ...["-framerate", `${source.fps}`, "-i", toColorName("%04d")],
          ...["-framerate", `${source.fps}`, "-i", toAlphaName("%04d")],
          ...[
            "-filter_complex",
            `[0:v][1:v]alphamerge,fps=${fps},scale=${size.width}:${size.height}`,
          ],
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

/**
 * REQUIREMENTS.md § 13.4.1. The box and length of a cut clip, read through the same
 * `mediabunny` demuxer `cropVideo` produced it with.
 *
 * WARN: Not an `<video>` element, which is what this was and what failed on iOS. An
 * iPhone has a handful of hardware video decoders, and by the time the encode is
 * reached the trimmer, the cropper and — for a cutout — the frame matter have each
 * taken one; a fresh `<video>` asked for its metadata then errors outright, which
 * surfaced as 영상을 읽지 못했어요 at 완료. `mediabunny` reads the container without a
 * decoder at all, and its display dimensions carry the track's rotation the way the
 * cropper's rectangle already does.
 */
async function measureVideo(
  file: File,
): Promise<{ width: number; height: number; seconds: number }> {
  const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });

  try {
    const track = await input.getPrimaryVideoTrack();

    if (!track) {
      throw new Error("video has no track");
    }

    const [width, height, duration] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
    ]);

    if (!(width > 0 && height > 0)) {
      throw new Error("video has no readable box");
    }

    // INFO: § 13.4.1.'s ceiling as the fallback, which is what the clip was cut to — a container reporting no duration would otherwise leave the frame count at zero.
    const seconds =
      Number.isFinite(duration) && duration > 0 ? duration : MAX_EMOTICON_VIDEO_DURATION / A_SECOND;

    return { width, height, seconds };
  } finally {
    input.dispose();
  }
}

function toAnimatedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.webp`;
}
