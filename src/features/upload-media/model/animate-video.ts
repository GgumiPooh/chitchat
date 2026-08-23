import { MAX_EMOTICON_VIDEO_DURATION } from "@/shared/config";
import { A_SECOND } from "@/shared/lib";
import { BlobSource, Input, MP4, QTFF, WEBM } from "mediabunny";
import {
  CUTOUT_ATTEMPTS,
  MATTE_SHARE,
  encodeAnimation,
  toEncodedFrames,
  type EncodeSource,
} from "./animate-encode";
import { fitWithin } from "./canvas";
import { toEvenEdge } from "./ffmpeg-runtime";
import { matteVideoFrames } from "./matte-video";
import type { EncodeProgress, OptimizedMedia } from "./optimize-result";

// INFO: `trimVideo`'s list — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

export type AnimateVideoOptions = {
  /** REQUIREMENTS.md § 13.4.2. Matte every frame before encoding. */
  cutout?: boolean;
};

/** REQUIREMENTS.md § 13.4.1. Turns a cut-down clip into the animated WebP an emoticon's animated slot holds. */
export async function animateVideo(
  file: File,
  maxEdge: number,
  onProgress?: EncodeProgress,
  { cutout = false }: AnimateVideoOptions = {},
): Promise<OptimizedMedia> {
  const measured = await measureVideo(file);
  const fitted = fitWithin(measured.width, measured.height, maxEdge);
  const scaled = { width: toEvenEdge(fitted.width), height: toEvenEdge(fitted.height) };
  // WARN: The clip's bytes are read only when it is the encode source. The cutout path never touches them, and reading a whole file into a buffer it discards is real memory on the iPhone this runs on.
  const source: EncodeSource = cutout
    ? await toMattedSource(file, CUTOUT_ATTEMPTS[0].fps, scaled, onProgress)
    : { kind: "clip", bytes: new Uint8Array(await file.arrayBuffer()) };

  return encodeAnimation(file, source, scaled, measured.seconds, onProgress, { matted: cutout });
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

  return { kind: "frames", frames: await toEncodedFrames(matted), fps };
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
