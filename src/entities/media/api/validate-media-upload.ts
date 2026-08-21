import "server-only";

import {
  isAllowedEmoticonAsset,
  isAllowedMediaMime,
  isFileMime,
  isThumbnailMime,
  isVideoMime,
  isVoiceMime,
  isWaveformPeaks,
  MAX_FILE_SIZE,
  MAX_THUMBNAIL_SIZE,
  MAX_VOICE_SIZE,
  maxSizeForScope,
  needsThumbnail,
  toSafeFilename,
  VISUAL_KINDS,
  type MediaKind,
  type MediaScope,
} from "@/shared/config";
import type { Nullable, UserId } from "@/shared/lib";
import {
  headAcceptableObject,
  toScopePrefix,
  toThumbKey,
  type StoredObject,
} from "@/shared/storage";
import type { MediaUpload } from "../model/upload";

/** Everything `validateMediaUpload` decided before a transaction opens — the INSERT half (`insertMedia`) trusts every field here as-is. */
export type ValidatedMedia = {
  ownerId: UserId;
  r2Key: string;
  scope: MediaScope;
  kind: MediaKind;
  mime: string;
  size: number;
  hasNoBox: boolean;
  width: Nullable<number>;
  height: Nullable<number>;
  durationMs: Nullable<number>;
  blurhash: Nullable<string>;
  filename: Nullable<string>;
  waveformPeaks: Nullable<number[]>;
};

export type ValidateMediaUploadParams = {
  ownerId: UserId;
  upload: MediaUpload;
  scope: MediaScope;
};

/**
 * Checks an uploaded pair of objects against REQUIREMENTS.md § 14.'s type and size
 * limits and REQUIREMENTS.md § 9.'s per-kind rules, and resolves what `insertMedia`
 * will write. Null refuses the upload outright.
 *
 * WARN: The R2 `HeadObject` calls below stay outside any transaction. They are
 * network round trips, and holding a pooled connection across one is how a
 * two-person app runs out of connections.
 *
 * WARN: This is where REQUIREMENTS.md § 14.'s type and size limits are actually
 * enforced. The upload went straight to R2 (§ 9.), so the server never saw the
 * bytes — it reads back what R2 stored and refuses anything outside the allow-list.
 * Nothing without a row is reachable from the app.
 *
 * WARN: § 9.1. Whether this is a file attachment is decided **here**, from the
 * stored mime, and never from the caller's `filename`. The column is the
 * discriminator every other reader branches on, so letting a client set it would
 * let it file a JPEG out of the library, or claim a `.zip` was a photo and put an
 * undrawable row in the grid.
 *
 * WARN: § 9.3. A voice message is the one row whose discriminator the client does
 * supply, because the server never sees the bytes and cannot extract a waveform
 * (§ 9.). What is enforced here instead is that peaks may only ride a mime this app
 * actually records into, and only in the shape the recorder produces — otherwise a
 * JPEG could be filed as a voice message and would vanish from the library.
 */
export async function validateMediaUpload({
  ownerId,
  upload,
  scope,
}: ValidateMediaUploadParams): Promise<Nullable<ValidatedMedia>> {
  const { r2Key, durationMs, blurhash, filename, waveformPeaks } = upload;

  // WARN: The prefix is the ownership check. `buildStorageKey` puts the uploader's id in the key, so a caller naming someone else's key is claiming an object it never uploaded. The scope is matched too, or an emoticon object could be claimed as a `media` row and land in the library (§ 13.3.).
  if (!r2Key.startsWith(toScopePrefix(scope, ownerId))) {
    return null;
  }

  // WARN: Both HEADs still go out together, including the one a file will not need. Deciding first would put the two round trips in series on the send path, and a miss on a key R2 holds nothing at costs a request rather than a correctness problem.
  const [object, thumbnail] = await Promise.all([
    headAcceptableObject(r2Key, isAcceptableObject(scope)),
    // WARN: The thumbnail is checked as strictly as the original. It is what every chat cell, grid tile and video poster loads, so an unchecked `_thumb` key is the same hole in § 14. by another name.
    headAcceptableObject(
      toThumbKey(r2Key),
      ({ mime, size }) => isThumbnailMime(mime) && size <= MAX_THUMBNAIL_SIZE,
    ),
  ]);

  if (!object) {
    return null;
  }

  // WARN: § 9.3. Voice is decided before file, and it narrows what would otherwise be a file: `isFileMime` is true for `audio/mp4`, so an unguarded order files every recording as an attachment. The peaks must be well-formed *and* ride a recordable mime — a caller cannot turn a `.zip` or a JPEG into a voice message by attaching an array to it.
  const isVoice =
    Boolean(waveformPeaks) &&
    isVoiceMime(object.mime) &&
    isWaveformPeaks(waveformPeaks ?? []) &&
    object.size <= MAX_VOICE_SIZE;

  // WARN: § 9.3. Peaks that failed any part of the test above are **refused**, never quietly dropped. Stored as a file instead, the object would render as a download card in the bubble the sender recorded a voice message into.
  if (waveformPeaks && !isVoice) {
    return null;
  }

  // WARN: The finished restructure. Ahead of `isFile` for exactly the reason `isVoice` is: `isFileMime` is true for every `audio/*` (§ 9.3. keeps them off the media allow-list on purpose), so without this an emoticon's sound is decided as an attachment and the `audio` branch of `toMediaKind` is unreachable — which is what it was, dead from the day the kind was added.
  // INFO: Narrowed to the one scope that has a sound, so nothing on the chat path changes: a `.m4a` sent as an attachment is still a file, and a recording is still caught by `isVoice` above.
  const isEmoticonAudio = !isVoice && scope === "emoticon" && object.mime.startsWith("audio/");

  const isFile = !isVoice && !isEmoticonAudio && isFileMime(object.mime);
  const storedName = isFile && filename ? toSafeFilename(filename) : null;

  // INFO: § 9.1. An avatar or a background is drawn from its own object, and a file has neither a box nor a tile to be drawn as.
  if (isFile && (scope !== "chat" || !storedName)) {
    return null;
  }

  if (isVoice && scope !== "chat") {
    return null;
  }

  // WARN: § 9.3. A recording's duration is required, not merely nullable. It is wall-clock from the browser and nothing recomputes it here, and the player draws its progress against it — at `0` the bubble reads `0:00` under a waveform that never fills however long the clip runs.
  if (isVoice && (durationMs ?? 0) <= 0) {
    return null;
  }

  const kind = toMediaKind(object.mime, { isFile, isVoice, isEmoticonAudio });

  // WARN: The finished restructure. Derived from the resolved kind against `VISUAL_KINDS`, never a hand-written list of the kinds that have no box. `media_no_box_when_not_visual_check` is written against that same set, so this way the function and the constraint cannot disagree.
  const hasNoBox = !VISUAL_KINDS.includes(kind as (typeof VISUAL_KINDS)[number]);

  // INFO: § 9.1. A file attachment has no sibling to require — nothing renders it, and `toVariantKey` never asks for a thumb variant of a row carrying a filename. A voice message has none either (§ 9.3.), for the same reason and by the same single PUT.
  // WARN: A scope question rather than a kind one. An emoticon **is** a drawn image and still uploads no `_thumb`: the thumbnail rule is a fixed 720px JPEG, which is larger than `EMOTICON_MAX_EDGE` and would flatten the alpha the bubble-less art is drawn with (`REQUIREMENTS.md § 13.3.`). Its own object is already tile-sized, so it is served as `original` everywhere.
  if (needsThumbnail(scope) && !hasNoBox && !thumbnail) {
    return null;
  }

  // WARN: REQUIREMENTS.md § 8.3. A photo or a video that arrives without a usable box is refused here rather than stored: `toMediaBoxHeight` divides by `width` for a single attachment, so an unmeasured row makes the whole virtualized list resolve its total size to `NaN` and stop laying out.
  if (!hasNoBox && (upload.width <= 0 || upload.height <= 0)) {
    return null;
  }

  return {
    ownerId,
    r2Key,
    scope,
    kind,
    mime: object.mime,
    size: object.size,
    hasNoBox,
    // WARN: § 9.1., § 9.3. Nulled rather than trusted. The client has no box to measure for either kind, so whatever it sent is a guess the row would carry forever — and § 2.5.'s CHECK refuses a number here anyway.
    width: hasNoBox ? null : upload.width,
    height: hasNoBox ? null : upload.height,
    // WARN: § 9.3. A voice message **keeps** its duration where a file drops one. It is not decoration: the player draws its progress against this figure rather than against `audio.duration`, which a `MediaRecorder` WebM reports as `Infinity`. Nulling it here is what left the waveform frozen at `0:00`.
    durationMs: isFile ? null : (durationMs ?? null),
    // INFO: § 9.1., § 9.3. Nulled across `hasNoBox` for one reason, not two: neither kind uploaded a `_thumb` object for a placeholder to stand in for, and neither is drawn in a box one could be painted into.
    // WARN: Accepted as sent for everything else, and shape is all that was checked. A forged hash blurs to a colour the thumbnail then replaces — the same bounded consequence § 9.3. accepts for client-supplied peaks, and unlike them this is not a discriminator, so nothing branches on it.
    blurhash: hasNoBox ? null : (blurhash ?? null),
    filename: storedName,
    waveformPeaks: isVoice ? (waveformPeaks ?? null) : null,
  };
}

/**
 * WARN: `voice` before `audio`, and the two are not the same. A recording is decided
 * above — peaks, in the right shape, on a mime this app records into — and anything
 * else that is audio is an ordinary audio object. Collapsing them would file § 5.'s
 * emoticon sounds as voice messages and put them in 보관함's 음성 shelf.
 */
function toMediaKind(
  mime: string,
  {
    isFile,
    isVoice,
    isEmoticonAudio,
  }: { isFile: boolean; isVoice: boolean; isEmoticonAudio: boolean },
): MediaKind {
  if (isVoice) {
    return "voice";
  }

  // WARN: Before `isFile`, which is where the caller has already resolved it — the mime alone cannot answer this, since a recording, an attached `.m4a` and an emoticon's sound are all `audio/*` and only the scope and the peaks tell them apart.
  if (isEmoticonAudio) {
    return "audio";
  }

  if (isFile) {
    return "file";
  }

  return isVideoMime(mime) ? "video" : "image";
}

/**
 * INFO: § 9.1. A file is bounded by its own ceiling; a photo or a video keeps the
 * per-type one, which the scope may narrow further.
 *
 * WARN: The unrecognised type is refused as its own branch, never by handing back a
 * ceiling of `0`. The caller's test is `size <= ceiling`, and a zero-byte object
 * passes `0 <= 0` — which is reachable, since a presigned PUT enforces neither the
 * signed type nor any size (§ 9.), so a malformed mime could be stored under a key
 * whose `_thumb` sibling is a real JPEG and register as a photo.
 */
function isAcceptableObject(scope: MediaScope) {
  return ({ mime, size }: StoredObject) => {
    // WARN: The emoticon scope is answered by § 13.2.'s own rules and never by the media allow-list, which is **wider** in exactly the direction that matters: it admits `image/jpeg` and `image/heic`, and an emoticon is bubble-less transparent art (§ 13.3.) that a JPEG cannot carry.
    if (scope === "emoticon") {
      return isAllowedEmoticonAsset(
        mime.startsWith("audio/") ? "audio" : "animated-image",
        mime,
        size,
      );
    }

    if (isAllowedMediaMime(mime)) {
      return size <= maxSizeForScope(mime, scope);
    }

    return isFileMime(mime) && size <= MAX_FILE_SIZE;
  };
}
