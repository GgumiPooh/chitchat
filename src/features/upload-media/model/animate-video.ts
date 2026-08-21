import { MAX_EMOTICON_IMAGE_SIZE, MAX_EMOTICON_VIDEO_DURATION } from "@/shared/config";
import { A_SECOND, type Nullable } from "@/shared/lib";
import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fitWithin } from "./canvas";
import { enqueueFfmpeg, loadFfmpeg, toEvenEdge } from "./ffmpeg-runtime";
import { ANIMATION_MIME } from "./optimize-animation";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";
import { releaseSource } from "./read-draft";

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

// INFO: `libwebpenc_common.c`'s max (0-6). A video-derived animation is the one encode here big enough for the smaller default to cost real bytes.
const COMPRESSION_LEVEL = 6;

// INFO: ffmpeg says why it refused in its last few lines, and nothing else in the browser can answer that question afterwards.
const LOG_TAIL_LINES = 12;

// INFO: The counter in ffmpeg's own stats line, which is the only thing that moves while an animation is being built.
const FRAME_COUNT = /frame=\s*(\d+)/;

/** Which of the two things went wrong, since only one of them has an action for the user. */
export type AnimationFailure = "encode" | "oversize";

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
): Promise<OptimizedMedia> {
  const [bytes, source] = await Promise.all([
    file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
    measureVideo(file),
  ]);
  const fitted = fitWithin(source.width, source.height, maxEdge);
  const scaled = { width: toEvenEdge(fitted.width), height: toEvenEdge(fitted.height) };

  for (const attempt of ATTEMPTS) {
    // WARN: Each rung reports its own 0 → 1 rather than a slice of the ladder. Spread across every rung, the common case — one encode, which is what almost every clip takes — could never fill more than a third of the bar.
    const frames = Math.max(1, Math.round(source.seconds * attempt.fps));
    const encoded = await encode(file, bytes, scaled, attempt, frames, (ratio) =>
      onProgress?.(ratio),
    );

    if (encoded.size <= MAX_EMOTICON_IMAGE_SIZE) {
      return { file: encoded, ...scaled };
    }
  }

  throw new AnimateVideoError("oversize", "every rung exceeded the emoticon size cap");
}

async function encode(
  file: File,
  bytes: Uint8Array,
  size: { width: number; height: number },
  { fps, quality }: (typeof ATTEMPTS)[number],
  frames: number,
  onProgress: EncodeProgress,
): Promise<File> {
  const inputName = `${crypto.randomUUID()}-input`;
  const outputName = `${crypto.randomUUID()}-output.webp`;
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

      await ffmpeg.writeFile(inputName, bytes);

      const exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        "-vf",
        `fps=${fps},scale=${size.width}:${size.height}`,
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
      await Promise.allSettled([ffmpeg?.deleteFile(inputName), ffmpeg?.deleteFile(outputName)]);
    }
  });
}

/** INFO: Metadata alone, never `toVideoDraft` — the box and the length are all this needs, and rendering a poster to get them is a decode and a blob nothing here would draw. */
function measureVideo(file: File): Promise<{ width: number; height: number; seconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const { videoWidth: width, videoHeight: height } = video;

      releaseSource(video);
      URL.revokeObjectURL(url);

      if (width > 0 && height > 0) {
        // INFO: § 13.4.1.'s ceiling as the fallback, which is what the clip was cut to — a container reporting no duration would otherwise leave the frame count at zero.
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;

        resolve({ width, height, seconds: duration || MAX_EMOTICON_VIDEO_DURATION / A_SECOND });
      } else {
        reject(new Error("video has no readable box"));
      }
    };
    video.onerror = () => {
      releaseSource(video);
      URL.revokeObjectURL(url);
      reject(new Error("video metadata failed to load"));
    };

    video.src = url;
  });
}

function toAnimatedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.webp`;
}
