import type { MediaDraft } from "@/entities/media";
import {
  FALLBACK_FILE_MIME,
  isAllowedMediaMime,
  isFileMime,
  isVideoMime,
  maxSizeForMime,
  toSafeFilename,
} from "@/shared/config";
import { A_SECOND, formatSize, randomId, type Nullable } from "@/shared/lib";
import { loadImage, renderThumbnail } from "./canvas";

// INFO: Far enough in that a video opening on a black frame still yields a recognisable poster, clamped below for a clip shorter than that.
const POSTER_SEEK_SECONDS = 0.2;

// WARN: `useMediaSelection.add` decodes serially, so a container that settles neither `seeked` nor `error` would drop every remaining file in the pick with no toast and leave the tray reading forever.
const DECODE_TIMEOUT = 15 * A_SECOND;

/** The Korean reason this file cannot be attached, or `null` when it can. */
export function validateFile(file: File): Nullable<string> {
  const mime = toStoredMime(file);

  // INFO: REQUIREMENTS.md § 9.1. Anything shaped like a mime gets through as a file attachment, so this only refuses a type that is malformed — the app draws what it recognises and downloads the rest.
  if (!isAllowedMediaMime(mime) && !isFileMime(mime)) {
    return "지원하지 않는 형식이에요";
  }

  // WARN: REQUIREMENTS.md § 9.1. Refused here or never — `/api/media/upload-url` takes a `positive` size, so a zero-byte pick stages fine and then fails the send with a 400 no 재전송 can clear. Media never reached that, because a zero-byte image or video fails to decode and is refused at the pick.
  if (file.size === 0) {
    return "빈 파일은 보낼 수 없어요";
  }

  if (file.size > maxSizeForMime(mime)) {
    return `${formatSize(maxSizeForMime(mime))}까지 보낼 수 있어요`;
  }

  return null;
}

/**
 * REQUIREMENTS.md § 9.1. What the object will be stored as.
 *
 * WARN: An empty `File.type` is routine — the OS has no type registered for the
 * extension — and it has to become a real one here, because it is signed into the
 * PUT and read back at registration, where a blank mime is refused.
 */
export function toStoredMime(file: File): string {
  return file.type || FALLBACK_FILE_MIME;
}

/**
 * Reads the dimensions the `media` row needs and renders the thumbnail that goes
 * up beside the original.
 *
 * WARN: The size comes from the decoded asset, never from the file's metadata —
 * REQUIREMENTS.md § 8.3. reserves the bubble's box from it before the image loads,
 * so a wrong number is a visible scroll jolt rather than a cosmetic error.
 */
export function toMediaDraft(file: File): Promise<MediaDraft> {
  const mime = toStoredMime(file);

  // INFO: REQUIREMENTS.md § 9.1. A file attachment is never decoded — there is no box to measure and no frame to render, so it stages the moment it is picked.
  if (isFileMime(mime)) {
    return Promise.resolve(toFileDraft(file, mime));
  }

  return isVideoMime(mime) ? toVideoDraft(file) : toImageDraft(file);
}

function toFileDraft(file: File, mime: string): MediaDraft {
  return {
    id: randomId(),
    file,
    thumbnail: null,
    previewUrl: null,
    mime,
    // INFO: § 9.1. The card is a fixed height (DESIGN.md § 6.5.), so § 8.3.'s estimate needs no dimensions from here — and the row stores zeroes whatever this said.
    width: 0,
    height: 0,
    durationMs: null,
    filename: toSafeFilename(file.name),
  };
}

async function toImageDraft(file: File): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const { naturalHeight: height, naturalWidth: width } = image;
    const thumbnail = await renderThumbnail(image, width, height);

    return {
      id: randomId(),
      file,
      thumbnail,
      previewUrl: URL.createObjectURL(thumbnail),
      mime: file.type,
      width,
      height,
      durationMs: null,
      filename: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function toVideoDraft(file: File): Promise<MediaDraft> {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const video = await loadVideoFrame(sourceUrl);
    const { videoHeight: height, videoWidth: width } = video;

    // INFO: A zero-sized track would render a zero-sized canvas and only fail at registration, where § 8.3.'s dimensions must be positive.
    if (width === 0 || height === 0) {
      throw new Error("video decode failed");
    }

    const thumbnail = await renderThumbnail(video, width, height);

    return {
      id: randomId(),
      file,
      thumbnail,
      previewUrl: URL.createObjectURL(thumbnail),
      mime: file.type,
      width,
      height,
      durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * A_SECOND) : null,
      filename: null,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/**
 * WARN: `muted` + `playsInline` + a `play()` are all load-bearing on iOS. WebKit
 * will not decode a frame into a canvas for a video that has never played, so a
 * seek alone yields a blank poster, and an unmuted `play()` without a user
 * gesture is refused outright.
 *
 * WARN: `seeked` and `timeupdate` say the *position* moved, never that a frame has
 * been painted — `drawImage` off either one races the decoder and writes a black
 * poster often enough to be the normal result for some files. `requestVideoFrameCallback`
 * is the one signal that means "a frame is on screen", so it wins wherever it
 * exists (Safari 15.4+, comfortably under the app's iOS 16.4 floor) and the two
 * events stay as the fallback for engines without it.
 */
function loadVideoFrame(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const timer = setTimeout(() => fail(new Error("video decode timed out")), DECODE_TIMEOUT);
    let isSettled = false;

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onerror = () => fail(new Error("video decode failed"));

    video.onloadedmetadata = () => {
      video.currentTime = toPosterTime(video.duration);
      void video.play().catch(() => undefined);
      video.requestVideoFrameCallback?.(() => succeed());
    };

    // INFO: Only reached where `requestVideoFrameCallback` is absent — it resolves first everywhere else, and `isSettled` is what keeps the loser from re-entering.
    video.onseeked = () => succeed();
    // WARN: Seeking to the position the video already holds produces no `seeked` at all. Playback is running by then, so the first frame decoded arrives here instead.
    video.ontimeupdate = () => succeed();

    video.src = src;

    function succeed() {
      if (isSettled) {
        return;
      }

      isSettled = true;
      clearTimeout(timer);
      video.pause();
      resolve(video);
    }

    function fail(error: Error) {
      if (isSettled) {
        return;
      }

      isSettled = true;
      clearTimeout(timer);
      video.pause();
      reject(error);
    }
  });
}

// WARN: `duration` is `NaN` at `loadedmetadata` for a fragmented MP4 and some `.mov`. Assigning that to `currentTime` throws inside the event handler, where nothing settles the promise.
function toPosterTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(POSTER_SEEK_SECONDS, duration / 2);
}
