import { A_MEGABYTE, A_MINUTE, A_SECOND, type Nullable } from "@/shared/lib";

/** REQUIREMENTS.md § 9. Presigned PUT, then registration; the id route mints presigned GETs. */
export const MEDIA_UPLOAD_URL_PATH = "/api/media/upload-url";

export const MEDIA_PATH = "/api/media";

/** REQUIREMENTS.md § 12.1. Duplicates a readable object into the caller's `background/` scope. */
export const MEDIA_COPY_PATH = `${MEDIA_PATH}/copy`;

/** REQUIREMENTS.md § 10. Lists the library and takes rows back out of it. */
export const ARCHIVE_PATH = "/api/archive";

/**
 * Which shelf of the library (REQUIREMENTS.md § 10.) a listing asks for — the
 * 사진 / 파일 / 음성 segments, and the `kind` `GET /api/archive` takes.
 *
 * WARN: A union and never an `isFile` boolean. 음성 arrived as one literal here
 * and one clause in `isOfKind`, where a boolean would have had to be replaced in
 * the predicate, the API, the fetch, the hook and the URL alike.
 *
 * WARN: A member here is only half of a shelf — `isOfKind` is the other half, and
 * a literal added without the clause behind it does not open an empty segment, it
 * spills that kind into 사진, whose branch is "neither of the others".
 *
 * INFO: Derived from `filename` and `waveform_peaks`, so no column stores it (§ 6.).
 */
export const LIBRARY_KINDS = ["photo", "file", "voice"] as const;

export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * What each shelf is called on screen — the chips of DESIGN.md § 7.10., and the
 * only names a user has for these three sets.
 *
 * WARN: One table, read by the segment chips **and** by the copy that says an upload
 * landed on a different shelf than the one it was dropped on (REQUIREMENTS.md § 10.).
 * Written out twice, a renamed chip leaves the toast naming a shelf that is not there.
 */
export const LIBRARY_KIND_LABELS: Record<LibraryKind, string> = {
  photo: "사진",
  file: "파일",
  voice: "음성",
};

/**
 * The counter a shelf counts its rows in — 사진 in 장, everything else in 개.
 *
 * INFO: AGENTS.md § 0.4. The particle that follows is chosen by `josa` at the call
 * site, because `3장을` and `3개를` are the same sentence with different 받침.
 */
export function toLibraryCountUnit(kind: LibraryKind): string {
  return kind === "photo" ? "장" : "개";
}

/**
 * The key prefixes `POST /api/media/upload-url` will sign for, and the set
 * `POST /api/media` accepts a registration under.
 *
 * WARN: A subset of `StorageScope`, not a copy of it. `emoticon` is deliberately
 * absent — REQUIREMENTS.md § 13.3. keeps those objects out of `media` entirely and
 * registers them through their own route, because a `media` row is a library row.
 */
export const MEDIA_UPLOAD_SCOPES = ["chat", "avatar", "background"] as const;

export type MediaUploadScope = (typeof MEDIA_UPLOAD_SCOPES)[number];

// INFO: An avatar is only ever shown at 72px (DESIGN.md § 7.7.) or full-bleed in the § 7.10. viewer, and the shell is 576px wide — this covers the wider of the two at 2× without storing a whole camera roll photo per profile.
export const AVATAR_MAX_EDGE = 1_200;

// INFO: REQUIREMENTS.md § 12.1. A background is drawn full-bleed at the shell's 576px across whatever the visual viewport is tall, so the long edge is the one that has to cover — this is that at 2× on the tallest phone the shell runs on.
export const BACKGROUND_MAX_EDGE = 2_000;

/**
 * REQUIREMENTS.md § 12.1. The ceiling on a **profile** background video.
 *
 * WARN: Nothing to do with `MAX_VIDEO_SIZE`, which bounds one upload's
 * reliability. This bounds a **download**: a profile cover is fetched in full every
 * time either participant opens that profile, over whatever connection they are on.
 */
export const MAX_BACKGROUND_VIDEO_SIZE = 20 * A_MEGABYTE;

/**
 * REQUIREMENTS.md § 12.1. How long a profile background video may be.
 *
 * INFO: Enforced by trimming rather than by refusal — a longer pick opens the
 * trimmer instead of being rejected, so the cap never costs the user a re-pick.
 */
export const MAX_BACKGROUND_VIDEO_DURATION = 30 * A_SECOND;

// INFO: A 3-column grid, so a page is 20 rows — roughly two screens of scrolling before the next request.
export const ARCHIVE_PAGE_SIZE = 60;

// WARN: Caps what a caller may ask for; the request-side limit is clamped to it rather than rejected, as `MAX_MESSAGE_PAGE_SIZE` is.
export const MAX_ARCHIVE_PAGE_SIZE = 120;

// INFO: One selection's worth. Deletion is a single statement per id, and a body longer than this is a script rather than a thumb.
export const MAX_ARCHIVE_SELECTION = 200;

// WARN: REQUIREMENTS.md § 10. Saving several files is several top-level navigations that each resolve into a download, and a browser drops the ones that arrive in the same tick as the previous — this is the gap that keeps them apart.
export const ARCHIVE_DOWNLOAD_STAGGER = 0.4 * A_SECOND;

// WARN: REQUIREMENTS.md § 10. The share sheet takes the whole selection at once, so every file is in memory before it can open — this is a memory ceiling, not a preference. Past it the save falls back to the download path.
export const MAX_ARCHIVE_SHARE_FILES = 20;

// WARN: Read from `Content-Length` before a body is buffered, so the ceiling holds even when the count does not — twenty 4K videos are not twenty photos.
export const MAX_ARCHIVE_SHARE_BYTES = 200 * A_MEGABYTE;

// INFO: REQUIREMENTS.md § 14. iPhone ProRAW tops out around 50MB and a panorama around 15MB, so nothing from the camera roll is refused.
export const MAX_IMAGE_SIZE = 50 * A_MEGABYTE;

// WARN: A presigned PUT is a single request with no resume, so this is an upload-reliability ceiling, not a storage one — raising it needs multipart upload, not a bigger number. 500MB is roughly one minute of 4K60 or seven of 1080p30.
export const MAX_VIDEO_SIZE = 500 * A_MEGABYTE;

// WARN: REQUIREMENTS.md § 9.1. The same upload-reliability ceiling the line above sets, for the same reason — a file is one presigned PUT too. It is deliberately not smaller: the pair send each other archives and videos the OS declined to hand over as video.
export const MAX_FILE_SIZE = 500 * A_MEGABYTE;

// WARN: REQUIREMENTS.md § 9.1. R2 keys carry no name, so a file attachment's own name is stored on the row and rebuilt into `Content-Disposition` at download. Long enough for a real document title, short enough that the header stays one.
export const MAX_FILENAME_LENGTH = 200;

// INFO: What a `file` input reports for an extension the OS has no type for. Signed into the PUT and stored, so the row never carries an empty mime.
export const FALLBACK_FILE_MIME = "application/octet-stream";

// WARN: REQUIREMENTS.md § 9.1. A file attachment's type is whatever the browser claimed and R2 stored, so this is the only thing bounding what reaches `media.mime` — it is a shape check, never an allow-list.
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

// WARN: REQUIREMENTS.md § 9.1. The pattern above bounds the shape and not the length, and the file branch takes any string that matches it — so without this a client can sign a megabyte-long `Content-Type` into the PUT and have it stored on the row and echoed by every download. RFC 6838 caps each half at 127.
const MAX_MIME_LENGTH = 255;

// INFO: REQUIREMENTS.md § 18. #10. Selection is unlimited; a send longer than this is split across consecutive messages so the grid never needs a `+N` overflow cell.
export const MAX_MEDIA_PER_MESSAGE = 9;

/**
 * How many presigned PUTs a batch may have in flight (REQUIREMENTS.md § 13.4.).
 *
 * WARN: Meaningless without `MAX_UPLOAD_INFLIGHT_BYTES` beside it. Uploads were
 * serial precisely because a batch can be twenty 8MB emoticons or nine 500MB
 * videos, and a count alone cannot tell those apart.
 */
export const UPLOAD_CONCURRENCY = 4;

/**
 * The bytes a batch may have in flight at once, across `UPLOAD_CONCURRENCY` slots.
 *
 * INFO: Sized so a full width of emoticons (`MAX_EMOTICON_IMAGE_SIZE`, 8MB) runs in
 * parallel while a `MAX_VIDEO_SIZE` upload holds the budget alone — which is the old
 * serial behaviour, kept exactly where it was earning its keep.
 */
export const MAX_UPLOAD_INFLIGHT_BYTES = 32 * A_MEGABYTE;

// INFO: Long enough for a 500MB upload on a slow connection to start, short enough that a leaked URL is worthless.
export const UPLOAD_URL_EXPIRY = 10 * A_MINUTE;

// WARN: REQUIREMENTS.md § 9. The `Cache-Control` on the 302 MUST stay below this, or the browser reuses a redirect whose signature has expired.
export const MEDIA_URL_EXPIRY = 10 * A_MINUTE;

export const MEDIA_CACHE_MAX_AGE = 5 * A_MINUTE;

// INFO: The thumbnail is always JPEG — `canvas.toBlob` is the one encoder every iOS version implements, and both a resized photo and a video's poster frame go through it.
export const THUMBNAIL_MIME = "image/jpeg";

// WARN: REQUIREMENTS.md § 14. holds for the `_thumb` sibling too — R2 enforces nothing on a presigned PUT, so without this a client could park anything of any size at the key every chat cell and grid tile loads. A 720px JPEG at quality 0.82 is a small fraction of this.
export const MAX_THUMBNAIL_SIZE = 4 * A_MEGABYTE;

// INFO: REQUIREMENTS.md § 9. `heic`/`heif` are listed because iOS hands the original over when it declines to transcode, and iOS is where they arrive from — the thumbnail is rendered by decoding them in an `<img>`, so an engine without HEIC support rejects the pick outright rather than storing something it could never show.
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

// INFO: `quicktime` is the `.mov` an iPhone produces. We store whatever arrives (§ 9.) and the viewer falls back to a download when playback is refused.
export const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIMES)[number];

export type AllowedMediaMime = AllowedImageMime | AllowedVideoMime;

export function isVideoMime(mime: string): mime is AllowedVideoMime {
  return (ALLOWED_VIDEO_MIMES as readonly string[]).includes(mime);
}

export function isImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime);
}

export function isAllowedMediaMime(mime: string): mime is AllowedMediaMime {
  return isImageMime(mime) || isVideoMime(mime);
}

/**
 * Whether a § 9.1. file attachment is something a media element can play, which is
 * the one kind of file 보관함 offers more than 저장 for.
 *
 * WARN: Not `isVoiceMime`, and the two must not be conflated. That one is the short
 * list this app **records** into and is half of what makes a row a voice message
 * (§ 9.3.); this is every audio type a browser might have been handed, and a row
 * matching it is still a file on the 파일 shelf.
 */
export function isAudioMime(mime: string): boolean {
  return mime.startsWith("audio/");
}

/**
 * Whether this type is carried as a **file attachment** rather than as something
 * the grid and the viewer draw (REQUIREMENTS.md § 9.1.).
 *
 * WARN: The complement of the media allow-list, not a second list of its own. A
 * type the app cannot render is a file, which is what makes `image/svg+xml` or a
 * `.mkv` arrive as a downloadable card instead of as a broken tile — and what keeps
 * one type from ever being both.
 */
export function isFileMime(mime: string): boolean {
  return mime.length <= MAX_MIME_LENGTH && MIME_PATTERN.test(mime) && !isAllowedMediaMime(mime);
}

/**
 * The name a file attachment is stored and downloaded under.
 *
 * WARN: REQUIREMENTS.md § 9.1. Applied server-side at registration, not merely at
 * the pick. It strips the path segments a directory drop carries and the control
 * characters that would otherwise be built into a `Content-Disposition` header.
 */
export function toSafeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, " ")
    .trim();

  // WARN: Cut by code point, never by `slice`. A string index counts UTF-16 units, so a name ending in an emoji or an astral-plane ideograph is cut *inside* its surrogate pair — and the lone surrogate left behind is what makes `toDisposition` throw `URIError` on every attempt to save that attachment.
  return Array.from(cleaned).slice(0, MAX_FILENAME_LENGTH).join("") || "파일";
}

/** What a media bubble is called where it cannot be drawn — the § 8.10. quote and the § 16.1. push body. */
export type MediaKind = "photo" | "video" | "file" | "voice";

/**
 * The one kind that names a whole bubble's attachments.
 *
 * WARN: Lives here rather than in `entities/media` for the same reason `toMediaUrl`
 * does — the chat room composes an optimistic quote in the browser, and a value
 * import from that barrel drags `server-only` into the bundle.
 *
 * INFO: 사진 covers a mixed photo-and-video send: listing both would read as a
 * manifest in a line with room for neither. A file bubble never mixes with them at
 * all (REQUIREMENTS.md § 9.1.), so its own kind is exact rather than a majority.
 */
export function toMediaKind(items: MediaKindInput[]): Nullable<MediaKind> {
  if (items.length === 0) {
    return null;
  }

  // WARN: REQUIREMENTS.md § 9.3. First, and not as one more `every`. A voice row carries no `filename`, so every test below it reads one as a photo — and a voice bubble is always exactly one clip, which is why the first item settles it.
  if (items[0].voice) {
    return "voice";
  }

  if (items.every((item) => item.filename !== null)) {
    return "file";
  }

  return items.every((item) => isVideoMime(item.mime)) ? "video" : "photo";
}

export function toMediaLabel(kind: Nullable<MediaKind>): string {
  if (kind === "file") {
    return "파일";
  }

  if (kind === "voice") {
    return "음성";
  }

  return kind === "video" ? "동영상" : "사진";
}

type MediaKindInput = {
  mime: string;
  filename: Nullable<string>;
  /** REQUIREMENTS.md § 9.3. Present on a voice message and `null` on everything else — the same job `filename` does one line above. */
  voice?: Nullable<unknown>;
};

// INFO: R2 stores the bytes under a UUID key with no name of its own, so a file handed to the share sheet has to be named here.
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** The file extension a stored object should carry once it leaves the app under a name. */
export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? "bin";
}

// INFO: The reverse of the table above rather than a second table, so "what this type is called" and "what that name means" cannot drift apart.
// WARN: `jpeg` is the one alias the forward table cannot carry — it holds one extension per type — and it is as common as `.jpg` on exactly the files an OS declines to type.
const MEDIA_MIMES_BY_EXTENSION: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME_EXTENSIONS).map(([mime, name]) => [name, mime])),
  jpeg: "image/jpeg",
};

/**
 * REQUIREMENTS.md § 9.1. The media type a file's own name implies, for the one case
 * nothing else can answer: a `File` the OS handed over with no type at all.
 *
 * WARN: A fallback for an empty `File.type`, never an override of one — a browser
 * that did report a type read the bytes, where an extension is only a claim.
 *
 * WARN: Answers the § 9. allow-list or nothing. Guessing a type the app cannot draw
 * would move a file attachment onto the media path, which is the reverse of the
 * divergence this exists to close.
 */
export function toMediaMimeFromName(name: string): Nullable<AllowedMediaMime> {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MEDIA_MIMES_BY_EXTENSION[extension] ?? "";

  return isAllowedMediaMime(mime) ? mime : null;
}

/** The cap the given type is measured against. REQUIREMENTS.md § 14. */
export function maxSizeForMime(mime: string): number {
  if (isVideoMime(mime)) {
    return MAX_VIDEO_SIZE;
  }

  // WARN: The image cap is the narrow one, so the file branch has to come off `isImageMime` rather than off a trailing `else` — a `.zip` measured against `MAX_IMAGE_SIZE` is refused at 50MB with no copy that explains why.
  return isImageMime(mime) ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
}

/**
 * The cap for an object being uploaded under `scope`. REQUIREMENTS.md § 14.
 *
 * WARN: `background` is the one scope that narrows the video ceiling, and it must
 * be applied at registration too — the client's own check is a courtesy, and R2
 * enforces no size at all on a presigned PUT (§ 9.).
 */
export function maxSizeForScope(mime: string, scope: MediaUploadScope): number {
  if (scope === "background" && isVideoMime(mime)) {
    return MAX_BACKGROUND_VIDEO_SIZE;
  }

  return maxSizeForMime(mime);
}

/** REQUIREMENTS.md § 9. `thumb` for grid and chat cells, `original` for the viewer. */
export type MediaVariant = "thumb" | "original";

/**
 * The same-origin URL an `<img>` or `<video>` points at. It is a route, not an R2
 * URL: the request carries the session cookie, the handler validates it, and only
 * then does it redirect to a presigned URL (REQUIREMENTS.md § 9.).
 *
 * WARN: Lives here rather than in `entities/media` because chat rows call it in
 * the browser, and that entity's barrel also exports its `server-only` api segment.
 */
export function toMediaUrl(id: string, variant: MediaVariant = "thumb"): string {
  return `${MEDIA_PATH}/${id}?variant=${variant}`;
}

/**
 * The URL behind "원본 저장".
 *
 * WARN: An `<a download>` is not enough. The route answers a 302 to R2, and the
 * spec makes a browser drop `download` once the navigation resolves cross-origin —
 * in a standalone PWA that replaces the app with a bare asset view and no way back.
 * This flag is what puts `Content-Disposition: attachment` on the presigned GET.
 */
export function toMediaDownloadUrl(id: string): string {
  return `${toMediaUrl(id, "original")}&download=1`;
}
