import "server-only";

import {
  isAllowedEmoticonAsset,
  isAllowedMediaMime,
  isFileMime,
  isVideoMime,
  isVoiceMime,
  isWaveformPeaks,
  MAX_FILE_SIZE,
  MAX_THUMBNAIL_SIZE,
  MAX_VOICE_SIZE,
  maxSizeForScope,
  needsThumbnail,
  THUMBNAIL_MIME,
  toSafeFilename,
  VISUAL_KINDS,
  type MediaKind,
  type MediaScope,
} from "@/shared/config";
import { getDb, media, nextSnowflake } from "@/shared/db";
import type { MediaId, Nullable, UserId } from "@/shared/lib";
import { headAcceptableObject, toThumbKey, type StoredObject } from "@/shared/storage";
import { and, eq } from "drizzle-orm";
import { toArchiveMedia } from "../model/to-archive-media";
import type { ArchiveMedia } from "../model/types";

export type RegisterMediaParams = {
  ownerId: UserId;
  r2Key: string;
  /** RESTRUCTURE.md § 2.4. Null for a caller that has no box to measure, and refused below for one that should have had it. */
  width: Nullable<number>;
  height: Nullable<number>;
  durationMs?: Nullable<number>;
  /** REQUIREMENTS.md § 9. The placeholder for the `_thumb` object, encoded in the browser from the pixels it uploaded — the server never sees them, so it cannot produce one. */
  blurhash?: Nullable<string>;
  /** REQUIREMENTS.md § 9.1. What the file was picked as. Required of a file attachment and ignored for a photo or video, which are named by their type. */
  filename?: Nullable<string>;
  /** REQUIREMENTS.md § 9.3. The waveform extracted while recording, and the thing that makes this row a voice message rather than an attached audio file. */
  waveformPeaks?: Nullable<number[]>;
  // INFO: REQUIREMENTS.md § 10. Set by an upload that starts in the 보관함 tab. A chat attachment leaves it false and reaches the grid through the message it is sent in.
  addToGallery?: boolean;
  /**
   * WARN: REQUIREMENTS.md § 12.1. Read from the key rather than trusted from the caller,
   * and it narrows the size ceiling — a `background` video is bounded far below
   * `MAX_VIDEO_SIZE`.
   *
   * WARN: RESTRUCTURE.md § 5.2. `MediaScope`, not `MediaUploadScope`, and the two are
   * deliberately different sets. `MEDIA_UPLOAD_SCOPES` is what `POST /api/media/upload-url`
   * will sign a ticket for and stays the three it always was; this is what a `media` row
   * may **be**, which § 5. widens to `emoticon` because those objects are signed by
   * `/api/emoticons/upload-url` instead and still have to register through here — § 5.2.
   * collapses `listUnregisteredEmoticonKeys` and this function into one mechanism.
   */
  scope: MediaScope;
};

/**
 * Turns an uploaded pair of objects into the row the rest of the app points at.
 *
 * WARN: This is where REQUIREMENTS.md § 14.'s type and size limits are actually
 * enforced. The upload went straight to R2 (§ 9.), so the server never saw the
 * bytes — it reads back what R2 stored and refuses to write a row for anything
 * outside the allow-list. Nothing without a row is reachable from the app.
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
export async function registerMedia({
  ownerId,
  r2Key,
  width,
  height,
  durationMs,
  blurhash,
  filename,
  waveformPeaks,
  addToGallery = false,
  scope,
}: RegisterMediaParams): Promise<Nullable<ArchiveMedia>> {
  // WARN: Both HEADs still go out together, including the one a file will not need. Deciding first would put the two round trips in series on the send path, and a miss on a key R2 holds nothing at costs a request rather than a correctness problem.
  const [object, thumbnail] = await Promise.all([
    headAcceptableObject(r2Key, isAcceptableObject(scope)),
    // WARN: The thumbnail is checked as strictly as the original. It is what every chat cell, grid tile and video poster loads, so an unchecked `_thumb` key is the same hole in § 14. by another name.
    headAcceptableObject(
      toThumbKey(r2Key),
      ({ mime, size }) => mime === THUMBNAIL_MIME && size <= MAX_THUMBNAIL_SIZE,
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

  // WARN: RESTRUCTURE.md § 5.2. Ahead of `isFile` for exactly the reason `isVoice` is: `isFileMime` is true for every `audio/*` (§ 9.3. keeps them off the media allow-list on purpose), so without this an emoticon's sound is decided as an attachment and the `audio` branch of `toMediaKind` is unreachable — which is what it was, dead from the day the kind was added.
  // INFO: Narrowed to the one scope that has a sound, so nothing on the chat path changes: a `.m4a` sent as an attachment is still a file, and a recording is still caught by `isVoice` above.
  const isEmoticonAudio = !isVoice && scope === "emoticon" && object.mime.startsWith("audio/");

  const isFile = !isVoice && !isEmoticonAudio && isFileMime(object.mime);
  const storedName = isFile && filename ? toSafeFilename(filename) : null;

  // WARN: § 9.1. `addToGallery` used to be refused here too, and that half is gone: the old reason was that a file carried by no message had nowhere in the app to be found again, not anything about files. § 10.'s 파일 shelf is that place, so a row filed straight into it is now reachable exactly as a photo is.
  // INFO: § 9.1. `scope !== "chat"` stays, and it is the durable half — an avatar or a background is drawn from its own object, and a file has neither a box nor a tile to be drawn as.
  if (isFile && (scope !== "chat" || !storedName)) {
    return null;
  }

  // WARN: § 9.3. Likewise. The 음성 shelf now holds a recording that rides no bubble, so 보관함에만 추가 is a real choice on that screen and the row it writes is listed by the 음성 shelf's own kind (§ 10.).
  if (isVoice && scope !== "chat") {
    return null;
  }

  // WARN: RESTRUCTURE.md § 5.1. An emoticon asset is never a library row, and this is what makes that structural rather than remembered. § 5.1. argues it holds "by construction" — `isInLibrary()` wants `archive_added_at` or a live message and an emoticon has neither — but `archive_added_at` is exactly what this flag sets, so construction only holds while nobody passes it. `POST /api/media` cannot: it resolves the scope out of `MEDIA_UPLOAD_SCOPES`, which has no `emoticon` in it. § 5.'s own registration path calls this function directly, with no route in between to refuse it.
  if (scope === "emoticon" && addToGallery) {
    return null;
  }

  // WARN: § 9.3. A recording's duration is required, not merely nullable. It is wall-clock from the browser and nothing recomputes it here, and the player draws its progress against it — at `0` the bubble reads `0:00` under a waveform that never fills however long the clip runs.
  if (isVoice && (durationMs ?? 0) <= 0) {
    return null;
  }

  const kind = toMediaKind(object.mime, { isFile, isVoice, isEmoticonAudio });

  // WARN: RESTRUCTURE.md § 2.4. Derived from the resolved kind against `VISUAL_KINDS`, never a hand-written list of the kinds that have no box. `media_no_box_when_not_visual_check` is written against that same set, so this way the function and the constraint cannot disagree — and they did: `isFile || isVoice` left `audio` demanding a positive box that the CHECK requires to be NULL, which is a row that could not be written at all.
  const hasNoBox = !VISUAL_KINDS.includes(kind as (typeof VISUAL_KINDS)[number]);

  // INFO: § 9.1. A file attachment has no sibling to require — nothing renders it, and `toVariantKey` never asks for a thumb variant of a row carrying a filename. A voice message has none either (§ 9.3.), for the same reason and by the same single PUT.
  // WARN: RESTRUCTURE.md § 5.3. A scope question rather than a kind one. An emoticon **is** a drawn image and still uploads no `_thumb`: the thumbnail rule is a fixed 720px JPEG, which is larger than `EMOTICON_MAX_EDGE` and would flatten the alpha the bubble-less art is drawn with (`REQUIREMENTS.md § 13.3.`). Its own object is already tile-sized, so it is served as `original` everywhere.
  if (needsThumbnail(scope) && !thumbnail) {
    return null;
  }

  // WARN: REQUIREMENTS.md § 8.3. A photo or a video that arrives without a usable box is refused here rather than stored: `toMediaBoxHeight` divides by `width` for a single attachment, so an unmeasured row makes the whole virtualized list resolve its total size to `NaN` and stop laying out.
  // WARN: RESTRUCTURE.md § 2.4. `<= 0` as well as null, because the route still accepts a number from the client and `0` is what it used to send for a row with no box — that reading is now a null, and a zero arriving here is a caller that failed to measure rather than one that had nothing to measure.
  if (!hasNoBox && (width === null || height === null || width <= 0 || height <= 0)) {
    return null;
  }

  const [row] = await getDb()
    .insert(media)
    .values({
      id: nextSnowflake<MediaId>(),
      ownerId,
      r2Key,
      mime: object.mime,
      size: object.size,
      // INFO: RESTRUCTURE.md § 2.2. Decided above, from what the bytes turned out to be — never probed back out of the columns below, which is the ordering trap this column replaces.
      kind,
      scope,
      // WARN: § 9.1., § 9.3. Nulled rather than trusted. The client has no box to measure for either kind, so whatever it sent is a guess the row would carry forever — and § 2.5.'s CHECK refuses a number here anyway.
      width: hasNoBox ? null : width,
      height: hasNoBox ? null : height,
      // WARN: § 9.3. A voice message **keeps** its duration where a file drops one. It is not decoration: the player draws its progress against this figure rather than against `audio.duration`, which a `MediaRecorder` WebM reports as `Infinity`. Nulling it here is what left the waveform frozen at `0:00`.
      durationMs: isFile ? null : (durationMs ?? null),
      // INFO: § 9.1., § 9.3. Nulled across `hasNoBox` for one reason, not two: neither kind uploaded a `_thumb` object for a placeholder to stand in for, and neither is drawn in a box one could be painted into.
      // WARN: Accepted as sent for everything else, and shape is all that was checked (`POST /api/media`). A forged hash blurs to a colour the thumbnail then replaces — the same bounded consequence § 9.3. accepts for client-supplied peaks, and unlike them this is not a discriminator, so nothing branches on it.
      blurhash: hasNoBox ? null : (blurhash ?? null),
      filename: storedName,
      waveformPeaks: isVoice ? waveformPeaks : null,
      // WARN: RESTRUCTURE.md § 2.8. `archive_*` is the pair `isInLibrary` reads. The `gallery_*` columns still exist until migration B and are no longer written, so anything moved back to them writes a row 보관함 cannot see.
      archiveAddedAt: addToGallery ? new Date() : null,
    })
    // INFO: `r2_key` is unique, so a retried registration returns the row the first attempt wrote instead of failing the send.
    .onConflictDoNothing({ target: media.r2Key })
    .returning();

  if (row) {
    return toArchiveMedia(row);
  }

  return getMediaByKey(r2Key, ownerId);
}

/**
 * RESTRUCTURE.md § 2.2. What the row is, from the two decisions this function has
 * already made and the stored mime for the rest.
 *
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

  // WARN: RESTRUCTURE.md § 5.2. Before `isFile`, which is where the caller has already resolved it — the mime alone cannot answer this, since a recording, an attached `.m4a` and an emoticon's sound are all `audio/*` and only the scope and the peaks tell them apart.
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
    // WARN: RESTRUCTURE.md § 5.2. The emoticon scope is answered by § 13.2.'s own rules and never by the media allow-list, which is **wider** in exactly the direction that matters: it admits `image/jpeg` and `image/heic`, and an emoticon is bubble-less transparent art (§ 13.3.) that a JPEG cannot carry. Falling through to `isAllowedMediaMime` would have let one register the moment § 5. started calling this with the scope.
    // INFO: The slot is read off the mime because that is all this function has, and it is enough — § 13.2.'s two slots are an image and a sound, and nothing else reaches here under this scope.
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

async function getMediaByKey(r2Key: string, ownerId: UserId): Promise<Nullable<ArchiveMedia>> {
  const [existing] = await getDb()
    .select()
    .from(media)
    // WARN: Scoped to the owner for the same reason `createTextMessage` scopes its re-read — a conflict must never hand the caller a row that is not theirs.
    .where(and(eq(media.r2Key, r2Key), eq(media.ownerId, ownerId)))
    .limit(1);

  return existing ? toArchiveMedia(existing) : null;
}
