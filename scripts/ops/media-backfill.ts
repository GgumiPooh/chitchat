import {
  AVATAR_MAX_EDGE,
  BACKGROUND_MAX_EDGE,
  EMOTICON_MAX_EDGE,
  MAX_EMOTICON_AUDIO_SIZE,
  MAX_FILE_SIZE,
  MAX_IMAGE_SIZE,
  MAX_THUMBNAIL_SIZE,
  MAX_VIDEO_SIZE,
  isAnimatedImage,
  isAudioMime,
  needsThumbnail,
  type MediaKind,
  type MediaScope,
} from "@/shared/config";
import { getDb, media, type Media } from "@/shared/db";
import { mapPooled, safelyGetAsync, type Nullable } from "@/shared/lib";
import { getBucket, getR2, readObject, toThumbKey } from "@/shared/storage";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { encode as encodeBlurhash } from "blurhash";
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { formatBytes, notifyOps } from "./notify";

/**
 * REQUIREMENTS.md § 9. Re-encodes every already-stored `media` object with the same
 * rules `src/features/upload-media/model/` now applies at upload, so a photo taken
 * before that pipeline existed ends up in the same codec a fresh upload would.
 *
 * Run manually on the user's own machine — never scheduled, never called from the
 * app. Dry-run by default; nothing writes to R2 or Postgres unless
 * `MEDIA_BACKFILL_WRITE=true`.
 *
 * WARN: `MEDIA_ASSET_CACHE_CONTROL` (REQUIREMENTS.md § 9.) is `immutable` for a year on
 * the argument that "nothing rewrites an object at one key". This script is the one
 * exception to that premise — it overwrites the original and `_thumb` objects **in
 * place**, at their existing keys. A client that already cached either object under
 * the old bytes keeps them for up to a year. Harmless in practice (the same picture in
 * an older codec keeps rendering), but real, and worth knowing before running this at
 * scale.
 *
 * WARN: A handful of constants below are copied rather than imported, and are cited by
 * file and value. `src/features/upload-media/model/canvas.ts`,
 * `optimize-video.ts` and `optimize-animation.ts` are all reachable in principle — this
 * script tried importing from `canvas.ts` under `tsconfig.ops.json` and it threw
 * `TypeError: Cannot read properties of undefined (reading 'SNOWFLAKE_PATTERN')` out of
 * `shared/config/app.ts`, a real circular-import ordering bug that only surfaces when a
 * feature-layer module is the entry point of the module graph rather than
 * `@/shared/db`. That is a pre-existing bug in the app, not something this script may
 * fix (out of scope, `src/` is untouched) — so the numbers are copied instead.
 */

// WARN: `canvas.ts:20`. The chat-attachment still-image cap.
const STILL_IMAGE_MAX_EDGE = 1_920;
// WARN: `canvas.ts:29`. Applies to every AVIF still, at every scope — `applyEdit.ts`
// is the one function avatar, background and chat photos all encode through, and it
// never varies this by scope.
const EDITED_AVIF_QUALITY = 55;
// WARN: `canvas.ts:6`.
const THUMBNAIL_MAX_EDGE = 720;
// WARN: `canvas.ts:27`.
const THUMBNAIL_AVIF_QUALITY = 45;
// WARN: `optimize-video.ts:22`.
const VIDEO_MAX_LONG_EDGE = 1_920;
// WARN: `optimize-video.ts:25-27`, `bitrateCeilingFor`'s three ceilings, copied rather
// than the function itself so this file carries no import of `mediabunny` — that
// package is WebCodecs-only and has no business loading in a Node ops script.
const VIDEO_BITRATE_CEILING_1080P = 8_000_000;
const VIDEO_BITRATE_CEILING_720P = 5_000_000;
const VIDEO_BITRATE_CEILING_SD = 2_500_000;
// WARN: `optimize-animation.ts:15`, `:18`. Not exported there even under its own name —
// copied for the same reason as the block above.
const ANIMATION_WEBP_QUALITY = 75;
const ANIMATION_WEBP_COMPRESSION_LEVEL = 6;
// WARN: `optimize-audio.ts:25`. The AAC target every audio path — browser, emoticon import, this backfill — converges on.
const AUDIO_TARGET_BITRATE = 128_000;

// WARN: Bump this whenever any encode parameter above changes. It is written into R2
// object metadata on every PUT this script makes; bumping it makes objects this script
// already produced eligible for re-processing again instead of being skipped forever.
const OPTIMIZE_RULESET_VERSION = "1";
const OPTIMIZE_METADATA_KEY = "jandh-optimize-version";

function bitrateCeilingFor(longEdge: number): number {
  if (longEdge >= 1_920) {
    return VIDEO_BITRATE_CEILING_1080P;
  }

  return longEdge >= 1_280 ? VIDEO_BITRATE_CEILING_720P : VIDEO_BITRATE_CEILING_SD;
}

/** `canvas.ts`'s own `fitWithin` — copied for the reason at the top of this file. */
function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// INFO: `libwebp_anim`/x264's chroma subsampling wants an even edge; an odd one is
// rejected by neither encoder outright here, but rounding down is what `optimize-animation.ts`'s
// own `toEven` already does for the same codec family, so the two stay consistent.
function toEven(value: number): number {
  return value % 2 === 0 ? value : value - 1;
}

/**
 * The long edge a still image or a video at this scope and kind is capped to —
 * `applyEdit.ts` and `crop-video.ts` both cap avatar and background media at their own
 * edge (`AVATAR_MAX_EDGE`, `BACKGROUND_MAX_EDGE`) rather than the chat-attachment
 * `STILL_IMAGE_MAX_EDGE`/`VIDEO_MAX_LONG_EDGE` the task brief names generically — this
 * follows the real per-scope policy rather than one number for every scope.
 */
function targetEdgeFor(scope: MediaScope, kind: MediaKind): number {
  if (scope === "avatar") {
    return AVATAR_MAX_EDGE;
  }

  if (scope === "background") {
    return BACKGROUND_MAX_EDGE;
  }

  if (scope === "emoticon") {
    return EMOTICON_MAX_EDGE;
  }

  return kind === "video" ? VIDEO_MAX_LONG_EDGE : STILL_IMAGE_MAX_EDGE;
}

function isWriteEnabled(): boolean {
  return process.env.MEDIA_BACKFILL_WRITE?.trim().toLowerCase() === "true";
}

function readLimit(): Nullable<number> {
  const raw = process.env.MEDIA_BACKFILL_LIMIT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readConcurrency(): number {
  const raw = process.env.MEDIA_BACKFILL_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

let ffmpegAvailable: Nullable<boolean> = null;

/** WARN: Memoized — `spawnSync` per row would be 2000 process spawns for one answer. */
function hasFfmpeg(): boolean {
  if (ffmpegAvailable === null) {
    ffmpegAvailable = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).error === undefined;
  }

  return ffmpegAvailable;
}

async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getR2().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: { [OPTIMIZE_METADATA_KEY]: OPTIMIZE_RULESET_VERSION },
    }),
  );
}

type HeadWithMarker = { size: number; mime: string; optimized: boolean };

/**
 * A local `HeadObjectCommand`, not `headObject` from `@/shared/storage` — that helper
 * drops S3 user metadata, and this script needs the marker `putObject` above writes.
 * R2 lowercases metadata keys on the way back regardless of how they were set, so
 * `OPTIMIZE_METADATA_KEY` is written lowercase already and the lookup below needs no
 * normalization.
 */
async function headWithMarker(key: string): Promise<Nullable<HeadWithMarker>> {
  const head = await safelyGetAsync(() =>
    getR2().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key })),
  );

  if (!head?.ContentType || head.ContentLength === undefined) {
    return null;
  }

  return {
    size: head.ContentLength,
    mime: head.ContentType,
    optimized: head.Metadata?.[OPTIMIZE_METADATA_KEY] === OPTIMIZE_RULESET_VERSION,
  };
}

type EncodedImage = { buffer: Buffer; mime: string; width: number; height: number };

/** A single still frame, re-encoded to AVIF at `edge`/`quality`. Never throws. */
/**
 * The size the pixels will actually have once `.rotate()` has applied the EXIF
 * orientation, which is NOT what `metadata()` reports.
 *
 * WARN: `metadata()` describes the stored bytes, so a portrait iPhone photo (stored
 * landscape under orientation 6-8) reports its dimensions swapped. Sizing a resize
 * from those hands a landscape box to a portrait image, and sharp's default
 * `fit: "cover"` then centre-crops it — destroying the photo in place, since this
 * script overwrites the original at its own key.
 */
function toOrientedSize(
  metadata: {
    autoOrient?: { width: number; height: number };
    width?: number;
    height?: number;
  },
  fallback: number,
) {
  return {
    width: metadata.autoOrient?.width ?? metadata.width ?? fallback,
    height: metadata.autoOrient?.height ?? metadata.height ?? fallback,
  };
}

async function encodeStillAvif(
  bytes: Uint8Array,
  edge: number,
  quality: number,
): Promise<EncodedImage> {
  const image = sharp(bytes, { animated: false }).rotate();
  const oriented = toOrientedSize(await image.metadata(), edge);
  const size = fitWithin(oriented.width, oriented.height, edge);
  const buffer = await image
    // WARN: `fit: "inside"` rather than sharp's default `cover`, so a box that is wrong for any reason letterboxes down instead of cropping the picture away.
    .resize(size.width, size.height, { fit: "inside", withoutEnlargement: true })
    .avif({ quality })
    .toBuffer();

  return { buffer, mime: "image/avif", ...size };
}

/**
 * A multi-frame image, re-encoded to animated WebP — real multi-frame output verified
 * directly against sharp 0.35.3 (libwebp 1.6.0): a 3-frame synthetic GIF round-tripped
 * through `sharp({animated:true}).webp()` came back with `pages: 3`, so ffmpeg is not
 * needed for this half of the pipeline, only for video.
 */
async function encodeAnimatedWebp(
  bytes: Uint8Array,
  edge: number,
  lossless: boolean,
): Promise<EncodedImage> {
  const image = sharp(bytes, { animated: true });
  const metadata = await image.metadata();
  const size = {
    width: toEven(fitWithin(metadata.width ?? edge, metadata.pageHeight ?? edge, edge).width),
    height: toEven(fitWithin(metadata.width ?? edge, metadata.pageHeight ?? edge, edge).height),
  };
  const buffer = await image
    .resize(size.width, size.height, { fit: "inside", withoutEnlargement: true })
    .webp({
      lossless,
      quality: lossless ? undefined : ANIMATION_WEBP_QUALITY,
      effort: ANIMATION_WEBP_COMPRESSION_LEVEL,
    })
    .toBuffer();

  return { buffer, mime: "image/webp", ...size };
}

/**
 * `canvas.ts`'s `toBlurhash`, re-derived server-side from the FINAL re-encoded
 * thumbnail's own pixels — REQUIREMENTS.md § 9.'s rule that the hash stands in for the
 * `_thumb` object and nothing else. Only called when the thumbnail is actually
 * rewritten; an unchanged thumbnail keeps its existing hash untouched.
 *
 * WARN: `32`/`4`/`3` are `canvas.ts`'s own un-exported `BLURHASH_MAX_EDGE`,
 * `BLURHASH_COMPONENTS_LONG` and `BLURHASH_COMPONENTS_SHORT` — deliberately not
 * exported there (the source comment says a hash may only be taken from the exact
 * canvas that produced the object), copied here for the reason at the top of this file.
 */
async function computeBlurhash(thumbBuffer: Buffer): Promise<Nullable<string>> {
  try {
    const image = sharp(thumbBuffer);
    const metadata = await image.metadata();
    const size = fitWithin(metadata.width ?? 32, metadata.height ?? 32, 32);
    const isLandscape = size.width >= size.height;
    const raw = await image.resize(size.width, size.height).ensureAlpha().raw().toBuffer();

    return encodeBlurhash(
      new Uint8ClampedArray(raw),
      size.width,
      size.height,
      isLandscape ? 4 : 3,
      isLandscape ? 3 : 4,
    );
  } catch {
    return null;
  }
}

/**
 * Re-encodes a video through the `ffmpeg` CLI — not `@ffmpeg/ffmpeg`, the wasm/worker
 * build `optimize-animation.ts` uses in the browser, which has no equivalent worker
 * host in a plain Node process. Requires `ffmpeg` on `PATH`; callers must check
 * `hasFfmpeg()` first. Audio is passed through with `-c:a copy`, mirroring
 * `optimize-video.ts`'s own choice not to re-encode the sound track — and since a copy
 * can fail to remux into MP4 for an incompatible source codec, a non-zero exit is
 * treated as "could not optimize" rather than as a fatal error for the run.
 */
async function encodeVideoH264(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<Nullable<EncodedImage>> {
  const size = {
    width: toEven(fitWithin(width, height, VIDEO_MAX_LONG_EDGE).width),
    height: toEven(fitWithin(width, height, VIDEO_MAX_LONG_EDGE).height),
  };
  const ceiling = bitrateCeilingFor(Math.max(size.width, size.height));
  const dir = await mkdtemp(join(tmpdir(), "media-backfill-"));
  const inputPath = join(dir, "input");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, bytes);

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale=${size.width}:${size.height}`,
        "-c:v",
        "libx264",
        "-b:v",
        `${ceiling}`,
        "-maxrate",
        `${ceiling}`,
        "-bufsize",
        `${ceiling * 2}`,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ]);

      proc.on("error", () => resolve(-1));
      proc.on("close", (code) => resolve(code ?? -1));
    });

    if (exitCode !== 0) {
      return null;
    }

    const buffer = await readFile(outputPath);

    return { buffer, mime: "video/mp4", ...size };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type EncodedAudio = { buffer: Buffer; mime: string };

type AudioEncodeResult =
  { status: "already-optimal" } | { status: "failed" } | ({ status: "ok" } & EncodedAudio);

async function runFfprobe(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args);
    let stdout = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.on("error", () => resolve({ code: -1, stdout: "" }));
    proc.on("close", (code) => resolve({ code: code ?? -1, stdout }));
  });
}

/** `stage-items.ts`'s own `readAudioBitrate` — best-effort, so an absent `ffprobe` or a stream with no reported bitrate falls through to a real re-encode rather than blocking one. */
async function readAudioBitrate(inputPath: string): Promise<Nullable<number>> {
  const { code, stdout } = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=bit_rate",
    "-of",
    "default=nw=1:nk=1",
    inputPath,
  ]);

  if (code !== 0) {
    return null;
  }

  const parsed = Number.parseInt(stdout.trim(), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The container's own `format`-level bit_rate rather than the `v:0` stream's — many
 * MP4 muxers (including iPhone's) leave the per-stream field unset while the format
 * one is always derivable from size/duration, so this is the reading that actually
 * answers for the videos the bitrate ceiling exists to catch.
 */
async function readVideoBitrate(bytes: Uint8Array): Promise<Nullable<number>> {
  const dir = await mkdtemp(join(tmpdir(), "media-backfill-video-probe-"));
  const inputPath = join(dir, "input");

  try {
    await writeFile(inputPath, bytes);

    const { code, stdout } = await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=bit_rate",
      "-of",
      "default=nw=1:nk=1",
      inputPath,
    ]);

    if (code !== 0) {
      return null;
    }

    const parsed = Number.parseInt(stdout.trim(), 10);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Re-encodes audio to AAC/MP4 through the `ffmpeg` CLI, mirroring `stage-items.ts`'s
 * `reencodeEmoticonAudio` — including its bitrate pre-check, so a source already at or
 * under `AUDIO_TARGET_BITRATE` is reported `already-optimal` rather than re-encoded
 * for nothing.
 */
async function encodeAudioAac(bytes: Uint8Array): Promise<AudioEncodeResult> {
  const dir = await mkdtemp(join(tmpdir(), "media-backfill-audio-"));
  const inputPath = join(dir, "input");
  const outputPath = join(dir, "output.m4a");

  try {
    await writeFile(inputPath, bytes);

    const sourceBitrate = await readAudioBitrate(inputPath);

    if (sourceBitrate !== null && sourceBitrate <= AUDIO_TARGET_BITRATE) {
      return { status: "already-optimal" };
    }

    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        `${AUDIO_TARGET_BITRATE}`,
        "-movflags",
        "+faststart",
        outputPath,
      ]);

      proc.on("error", () => resolve(-1));
      proc.on("close", (code) => resolve(code ?? -1));
    });

    if (exitCode !== 0) {
      return { status: "failed" };
    }

    return { status: "ok", buffer: await readFile(outputPath), mime: "audio/mp4" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Stats = {
  scanned: number;
  mainOptimized: number;
  mainRepaired: number;
  mainErrors: number;
  mainBeforeBytes: number;
  mainAfterBytes: number;
  thumbOptimized: number;
  thumbErrors: number;
  thumbBeforeBytes: number;
  thumbAfterBytes: number;
  skipReasons: Record<string, number>;
};

function newStats(): Stats {
  return {
    scanned: 0,
    mainOptimized: 0,
    mainRepaired: 0,
    mainErrors: 0,
    mainBeforeBytes: 0,
    mainAfterBytes: 0,
    thumbOptimized: 0,
    thumbErrors: 0,
    thumbBeforeBytes: 0,
    thumbAfterBytes: 0,
    skipReasons: {},
  };
}

function bump(stats: Stats, reason: string): void {
  stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1;
}

/** The running before→after totals, saved bytes and percentage — shared by the per-item progress line and the final summary so the two can never disagree. */
function savedSummary(stats: Stats): {
  before: number;
  after: number;
  saved: number;
  percent: number;
} {
  const before = stats.mainBeforeBytes + stats.thumbBeforeBytes;
  const after = stats.mainAfterBytes + stats.thumbAfterBytes;
  const saved = Math.max(0, before - after);

  return { before, after, saved, percent: before > 0 ? (saved / before) * 100 : 0 };
}

type MainWork = {
  changed: boolean;
  newMime?: string;
  newSize?: number;
  newWidth?: number;
  newHeight?: number;
  pendingUpload?: { buffer: Buffer; mime: string };
};

/**
 * Decides what the main object needs, without writing anything — the caller performs
 * the R2 `PUT` and the row `UPDATE` afterward, gated on `MEDIA_BACKFILL_WRITE`, so a
 * dry run can still report the real before/after byte counts.
 *
 * WARN: Never trusts `row.mime`/`row.size` to decide whether work is needed — always
 * `HEAD`s the object first and compares. A mismatch there is exactly the crash-recovery
 * case REQUIREMENTS.md's write-ordering rule has to survive: a previous run's R2 write
 * landed and its row `UPDATE` did not. When that happens this repairs the row from
 * R2's own answer rather than re-uploading, and only then re-evaluates whether the
 * object is already in its target format — so a genuinely stale row does not cost a
 * whole extra run before it converges.
 */
async function planMain(row: Media, stats: Stats): Promise<MainWork> {
  const head = await headWithMarker(row.r2Key);

  if (!head) {
    stats.mainErrors += 1;
    console.error(`[media-backfill] ${row.id} main object missing at ${row.r2Key}`);

    return { changed: false };
  }

  const mime = head.mime;
  const size = head.size;
  let width = row.width;
  let height = row.height;

  if (head.mime !== row.mime || head.size !== row.size) {
    console.warn(
      `[media-backfill] ${row.id} row/R2 mismatch (row ${row.mime}/${row.size}, R2 ${head.mime}/${head.size}) — repairing the row from R2's own state`,
    );
    stats.mainRepaired += 1;

    if (row.kind === "image") {
      const bytes = await readObject(row.r2Key, MAX_IMAGE_SIZE);
      const metadata = bytes ? await sharp(bytes.bytes).metadata() : undefined;

      width = metadata?.width ?? width;
      height = metadata?.height ?? height;
    }
    // WARN: A video's real dimensions cannot be recovered from a HEAD alone, and this
    // deliberately does not shell out to `ffprobe` to get them — the repair case is
    // rare and this script already depends on `ffmpeg` for nothing else video-side but
    // the re-encode itself. `width`/`height` are left as the row's last known values.
  }

  // WARN: Every exit below returns this rather than a bare `{ changed: false }` — the repair above is only worth detecting if it is also written, and a skip that discards it re-reports the same mismatch on every future run without ever fixing it.
  const skip = (): MainWork =>
    mime !== row.mime || size !== row.size || width !== row.width || height !== row.height
      ? {
          changed: true,
          newMime: mime,
          newSize: size,
          newWidth: width ?? undefined,
          newHeight: height ?? undefined,
        }
      : { changed: false };

  const edge = targetEdgeFor(row.scope, row.kind);
  // WARN: `image/webp` has no shape-based fast path — mime/dimensions alone cannot tell an untouched animated original from an already-optimized output, so only `head.optimized` above can skip one.
  const alreadyAvif = mime === "image/avif" && Math.max(width ?? 0, height ?? 0) <= edge;

  stats.mainBeforeBytes += size;

  if (head.optimized || alreadyAvif) {
    bump(stats, "main-already-optimal");
    stats.mainAfterBytes += size;

    return skip();
  }

  if (row.kind === "video") {
    if (!hasFfmpeg()) {
      bump(stats, "main-ffmpeg-missing");
      stats.mainAfterBytes += size;

      return skip();
    }

    if (size > MAX_VIDEO_SIZE || width === null || height === null) {
      bump(stats, "main-unreadable");
      stats.mainAfterBytes += size;

      return skip();
    }

    const bytes = await readObject(row.r2Key, MAX_VIDEO_SIZE);

    if (!bytes) {
      stats.mainErrors += 1;
      stats.mainAfterBytes += size;

      return skip();
    }

    const alreadyMp4Shape = mime === "video/mp4" && Math.max(width, height) <= edge;

    if (alreadyMp4Shape) {
      const ceiling = bitrateCeilingFor(Math.max(width, height));
      const bitrate = await readVideoBitrate(bytes.bytes);

      // WARN: An unreadable bitrate is NOT treated as "under the ceiling" — an unknown reading falls through to a real re-encode rather than being assumed fine.
      if (bitrate !== null && bitrate <= ceiling) {
        bump(stats, "main-already-optimal");
        stats.mainAfterBytes += size;

        return skip();
      }
    }

    const encoded = await encodeVideoH264(bytes.bytes, width, height);

    if (!encoded || encoded.buffer.byteLength >= size) {
      bump(stats, encoded ? "main-not-smaller" : "main-reencode-failed");
      stats.mainAfterBytes += size;

      return skip();
    }

    stats.mainOptimized += 1;
    stats.mainAfterBytes += encoded.buffer.byteLength;

    return {
      changed: true,
      newMime: encoded.mime,
      newSize: encoded.buffer.byteLength,
      newWidth: encoded.width,
      newHeight: encoded.height,
      pendingUpload: { buffer: encoded.buffer, mime: encoded.mime },
    };
  }

  // kind === "image" from here.
  const bytes = await readObject(row.r2Key, MAX_IMAGE_SIZE);

  if (!bytes) {
    stats.mainErrors += 1;
    stats.mainAfterBytes += size;

    return skip();
  }

  const animated = isAnimatedImage(bytes.bytes);
  const encoded = animated
    ? await encodeAnimatedWebp(bytes.bytes, edge, row.scope === "emoticon")
    : await encodeStillAvif(bytes.bytes, edge, EDITED_AVIF_QUALITY);

  if (encoded.buffer.byteLength >= size) {
    bump(stats, "main-not-smaller");
    stats.mainAfterBytes += size;

    return skip();
  }

  stats.mainOptimized += 1;
  stats.mainAfterBytes += encoded.buffer.byteLength;

  return {
    changed: true,
    newMime: encoded.mime,
    newSize: encoded.buffer.byteLength,
    newWidth: encoded.width,
    newHeight: encoded.height,
    pendingUpload: { buffer: encoded.buffer, mime: encoded.mime },
  };
}

/**
 * `planMain`'s audio counterpart — `kind = 'audio'` (an emoticon's sound) and a
 * `kind = 'file'` row whose mime is audio (a chat-attached sound, per
 * `validate-media-upload.ts`'s `isEmoticonAudio`/`isFileMime` split). Never touches
 * `width`/`height`/`blurhash`: `media_no_box_when_not_visual_check` requires all
 * three stay NULL outside `('image','video')`, and `MainWork` simply never sets them
 * here. No thumbnail sibling exists for either kind, so `processRow` skips `planThumb`
 * for these rows entirely.
 */
async function planAudio(row: Media, stats: Stats): Promise<MainWork> {
  const head = await headWithMarker(row.r2Key);

  if (!head) {
    stats.mainErrors += 1;
    console.error(`[media-backfill] ${row.id} main object missing at ${row.r2Key}`);

    return { changed: false };
  }

  const mime = head.mime;
  const size = head.size;

  if (mime !== row.mime || size !== row.size) {
    console.warn(
      `[media-backfill] ${row.id} row/R2 mismatch (row ${row.mime}/${row.size}, R2 ${mime}/${size}) — repairing the row from R2's own state`,
    );
    stats.mainRepaired += 1;
  }

  const skip = (): MainWork =>
    mime !== row.mime || size !== row.size
      ? { changed: true, newMime: mime, newSize: size }
      : { changed: false };

  stats.mainBeforeBytes += size;

  if (head.optimized) {
    bump(stats, "main-already-optimal");
    stats.mainAfterBytes += size;

    return skip();
  }

  if (!hasFfmpeg()) {
    bump(stats, "main-ffmpeg-missing");
    stats.mainAfterBytes += size;

    return skip();
  }

  const cap = row.scope === "emoticon" ? MAX_EMOTICON_AUDIO_SIZE : MAX_FILE_SIZE;

  if (size > cap) {
    bump(stats, "main-unreadable");
    stats.mainAfterBytes += size;

    return skip();
  }

  const bytes = await readObject(row.r2Key, cap);

  if (!bytes) {
    stats.mainErrors += 1;
    stats.mainAfterBytes += size;

    return skip();
  }

  const encoded = await encodeAudioAac(bytes.bytes);

  if (encoded.status !== "ok") {
    bump(
      stats,
      encoded.status === "already-optimal" ? "main-already-optimal" : "main-reencode-failed",
    );
    stats.mainAfterBytes += size;

    return skip();
  }

  if (encoded.buffer.byteLength >= size) {
    bump(stats, "main-not-smaller");
    stats.mainAfterBytes += size;

    return skip();
  }

  stats.mainOptimized += 1;
  stats.mainAfterBytes += encoded.buffer.byteLength;

  return {
    changed: true,
    newMime: encoded.mime,
    newSize: encoded.buffer.byteLength,
    pendingUpload: { buffer: encoded.buffer, mime: encoded.mime },
  };
}

type ThumbWork = {
  changed: boolean;
  newBlurhash?: Nullable<string>;
  pendingUpload?: { buffer: Buffer; mime: string };
};

/**
 * Same shape as `planMain`, for the `_thumb` sibling. The `media` row carries no
 * column describing the thumbnail at all — `mime`/`size`/`width`/`height` are all the
 * MAIN object's — so there is nothing on the row that a thumbnail rewrite could ever
 * make untruthful, and no repair case to detect here. Idempotency instead comes
 * straight from R2: an already-AVIF thumbnail is downloaded (bounded, small) to check
 * its real pixel size before deciding to skip it.
 */
async function planThumb(row: Media, stats: Stats): Promise<ThumbWork> {
  const thumbKey = toThumbKey(row.r2Key);
  const head = await headWithMarker(thumbKey);

  if (!head) {
    stats.thumbErrors += 1;
    console.error(`[media-backfill] ${row.id} thumb object missing at ${thumbKey}`);

    return { changed: false };
  }

  stats.thumbBeforeBytes += head.size;

  if (head.optimized) {
    bump(stats, "thumb-already-optimal");
    stats.thumbAfterBytes += head.size;

    return { changed: false };
  }

  const bytes = await readObject(thumbKey, MAX_THUMBNAIL_SIZE);

  if (!bytes) {
    stats.thumbErrors += 1;
    stats.thumbAfterBytes += head.size;

    return { changed: false };
  }

  if (head.mime === "image/avif") {
    const metadata = await sharp(bytes.bytes).metadata();

    if (Math.max(metadata.width ?? 0, metadata.height ?? 0) <= THUMBNAIL_MAX_EDGE) {
      bump(stats, "thumb-already-optimal");
      stats.thumbAfterBytes += head.size;

      return { changed: false };
    }
  }

  let encoded: EncodedImage;

  try {
    encoded = await encodeStillAvif(bytes.bytes, THUMBNAIL_MAX_EDGE, THUMBNAIL_AVIF_QUALITY);
  } catch {
    // INFO: `canvas.ts`'s own AVIF-unavailable fallback, mirrored — a JPEG at the same
    // quality the client falls back to (`THUMBNAIL_QUALITY` 0.82 there, `82` on sharp's
    // 1-100 scale here).
    const image = sharp(bytes.bytes).rotate();
    const oriented = toOrientedSize(await image.metadata(), THUMBNAIL_MAX_EDGE);
    const size = fitWithin(oriented.width, oriented.height, THUMBNAIL_MAX_EDGE);
    const buffer = await image
      .resize(size.width, size.height, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    encoded = { buffer, mime: "image/jpeg", ...size };
  }

  if (encoded.buffer.byteLength >= head.size) {
    bump(stats, "thumb-not-smaller");
    stats.thumbAfterBytes += head.size;

    return { changed: false };
  }

  stats.thumbOptimized += 1;
  stats.thumbAfterBytes += encoded.buffer.byteLength;

  return {
    changed: true,
    newBlurhash: await computeBlurhash(encoded.buffer),
    pendingUpload: { buffer: encoded.buffer, mime: encoded.mime },
  };
}

/**
 * One row, start to finish. Never throws — a per-row failure is counted and logged so
 * one bad object cannot stop a 2000-object run.
 *
 * WARN: Write ordering is bytes first, row second, matching `shared/storage/reclaim.ts`'s
 * own rule for the same reason: the row is what names the key, so it must never claim a
 * format R2 does not yet hold. Both R2 `PUT`s land before the single row `UPDATE`, and
 * that `UPDATE`'s own `WHERE` re-checks `deleted_at IS NULL AND r2_purged_at IS NULL` —
 * REQUIREMENTS.md § 9.'s own pattern for "the freshness test in the DELETE's own qual"
 * — so a row soft-deleted by the live app between this run's SELECT and this write
 * simply updates zero rows; the R2 object was already overwritten in place, which is
 * harmless since the reclaim deletes that same key regardless of its bytes.
 */
async function processRow(row: Media, stats: Stats, dryRun: boolean): Promise<void> {
  stats.scanned += 1;

  try {
    const isAudioRow = row.kind === "audio" || (row.kind === "file" && isAudioMime(row.mime));
    const main = isAudioRow ? await planAudio(row, stats) : await planMain(row, stats);
    // WARN: Neither audio kind ever uploads a `_thumb` sibling (`validate-media-upload.ts`'s `hasNoBox`) — `planThumb` is skipped outright rather than HEAD-ing a key that was never written.
    const thumb =
      !isAudioRow && needsThumbnail(row.scope)
        ? await planThumb(row, stats)
        : { changed: false as const };

    if (!main.changed && !thumb.changed) {
      return;
    }

    if (dryRun) {
      console.log(
        `[media-backfill] (dry run) ${row.id} would update` +
          (main.changed ? ` main→${main.newMime} ${main.newSize}B` : "") +
          (thumb.changed ? ` thumb re-encoded` : ""),
      );

      return;
    }

    if (main.pendingUpload) {
      await putObject(row.r2Key, main.pendingUpload.buffer, main.pendingUpload.mime);
    }

    if (thumb.pendingUpload) {
      await putObject(toThumbKey(row.r2Key), thumb.pendingUpload.buffer, thumb.pendingUpload.mime);
    }

    const patch: Partial<typeof media.$inferInsert> = {};

    if (main.changed) {
      patch.mime = main.newMime;
      patch.size = main.newSize;

      // WARN: Set only when planMain actually computed one — an audio row's MainWork never does, and media_no_box_when_not_visual_check needs width/height left untouched rather than explicitly nulled.
      if (main.newWidth !== undefined) {
        patch.width = main.newWidth;
      }

      if (main.newHeight !== undefined) {
        patch.height = main.newHeight;
      }
    }

    // WARN: Only when one was actually computed. A re-encode that produced no hash leaves the stored one alone — it describes the same pixels in an older codec, where a null would retire a working placeholder for § 8.3.'s empty box.
    if (thumb.changed && thumb.newBlurhash) {
      patch.blurhash = thumb.newBlurhash;
    }

    const updated = await getDb()
      .update(media)
      .set(patch)
      .where(and(eq(media.id, row.id), isNull(media.deletedAt), isNull(media.r2PurgedAt)))
      .returning({ id: media.id });

    if (updated.length === 0) {
      console.warn(
        `[media-backfill] ${row.id} was soft-deleted mid-run — R2 already holds the new bytes, the row was left alone`,
      );
    }
  } catch (error) {
    stats.mainErrors += 1;
    console.error(`[media-backfill] ${row.id} failed`, error);
  }
}

async function main() {
  const dryRun = !isWriteEnabled();
  const limit = readLimit();
  const concurrency = readConcurrency();

  console.log(
    `[media-backfill] ${dryRun ? "DRY RUN" : "WRITE MODE"}, concurrency ${concurrency}${limit ? `, limit ${limit}` : ""}`,
  );

  if (!hasFfmpeg()) {
    console.warn(
      "[media-backfill] ffmpeg not found on PATH — video/audio re-encoding will be SKIPPED (thumbnails still run). Install it with `brew install ffmpeg` and re-run to pick them up.",
    );
  }

  const query = getDb()
    .select()
    .from(media)
    .where(
      and(
        isNull(media.deletedAt),
        isNull(media.r2PurgedAt),
        // WARN: `kind = 'voice'` is deliberately excluded — bounded by MAX_VOICE_DURATION, already small, and its waveform_peaks were sampled from the original bytes.
        or(
          inArray(media.kind, ["image", "video", "audio"]),
          and(eq(media.kind, "file"), like(media.mime, "audio/%")),
        ),
      ),
    )
    .orderBy(media.id);

  const rows = limit ? await query.limit(limit) : await query;

  console.log(`[media-backfill] ${rows.length} candidate row(s)`);

  const stats = newStats();
  let done = 0;

  await mapPooled(
    rows,
    async (row) => {
      await processRow(row, stats, dryRun);
      done += 1;

      const { saved, percent } = savedSummary(stats);

      console.log(
        `[media-backfill] progress ${done}/${rows.length} (${percent.toFixed(1)}%) — saved ${formatBytes(saved)}`,
      );
    },
    { limit: concurrency },
  );

  const { before, after, saved, percent } = savedSummary(stats);

  console.log(`[media-backfill] scanned ${stats.scanned}`);
  console.log(
    `[media-backfill] main: ${stats.mainOptimized} optimized, ${stats.mainRepaired} repaired, ${stats.mainErrors} errors`,
  );
  console.log(
    `[media-backfill] thumb: ${stats.thumbOptimized} optimized, ${stats.thumbErrors} errors`,
  );

  for (const [reason, count] of Object.entries(stats.skipReasons)) {
    console.log(`[media-backfill]   ${reason}: ${count}`);
  }

  console.log(
    `[media-backfill] ${formatBytes(before)} → ${formatBytes(after)} (saved ${formatBytes(saved)}, ${percent.toFixed(1)}%)`,
  );

  await notifyOps(
    dryRun ? "미디어 최적화 미리보기" : "미디어 최적화 완료",
    `${stats.scanned}개 검사 · 원본 ${stats.mainOptimized}개, 썸네일 ${stats.thumbOptimized}개 최적화 · ${formatBytes(saved)}(${percent.toFixed(1)}%) ${dryRun ? "절감 예상" : "절감"}`,
  );
}

main().then(
  () => process.exit(0),
  async (error: unknown) => {
    console.error("[media-backfill] failed", error);
    await notifyOps("미디어 최적화 실패", error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
