import { A_MEGABYTE, A_MINUTE, A_SECOND } from "@/shared/lib";

/** REQUIREMENTS.md § 9. Presigned PUT, then registration; the id route mints presigned GETs. */
export const MEDIA_UPLOAD_URL_PATH = "/api/media/upload-url";

export const MEDIA_PATH = "/api/media";

/** REQUIREMENTS.md § 10. Lists the gallery and takes photos back out of it. */
export const GALLERY_PATH = "/api/gallery";

/**
 * The key prefixes `POST /api/media/upload-url` will sign for, and the set
 * `POST /api/media` accepts a registration under.
 *
 * WARN: A subset of `StorageScope`, not a copy of it. `emoticon` is deliberately
 * absent — REQUIREMENTS.md § 13.3. keeps those objects out of `media` entirely and
 * registers them through their own route, because a `media` row is a gallery row.
 */
export const MEDIA_UPLOAD_SCOPES = ["chat", "avatar"] as const;

export type MediaUploadScope = (typeof MEDIA_UPLOAD_SCOPES)[number];

// INFO: An avatar is only ever shown at 72px (DESIGN.md § 7.7.) or full-bleed in the § 7.10. viewer, and the shell is 576px wide — this covers the wider of the two at 2× without storing a whole camera roll photo per profile.
export const AVATAR_MAX_EDGE = 1_200;

// INFO: A 3-column grid, so a page is 20 rows — roughly two screens of scrolling before the next request.
export const GALLERY_PAGE_SIZE = 60;

// WARN: Caps what a caller may ask for; the request-side limit is clamped to it rather than rejected, as `MAX_MESSAGE_PAGE_SIZE` is.
export const MAX_GALLERY_PAGE_SIZE = 120;

// INFO: One selection's worth. Deletion is a single statement per id, and a body longer than this is a script rather than a thumb.
export const MAX_GALLERY_SELECTION = 200;

// WARN: REQUIREMENTS.md § 10. Saving several files is several top-level navigations that each resolve into a download, and a browser drops the ones that arrive in the same tick as the previous — this is the gap that keeps them apart.
export const GALLERY_DOWNLOAD_STAGGER = 0.4 * A_SECOND;

// WARN: REQUIREMENTS.md § 10. The share sheet takes the whole selection at once, so every file is in memory before it can open — this is a memory ceiling, not a preference. Past it the save falls back to the download path.
export const MAX_GALLERY_SHARE_FILES = 20;

// WARN: Read from `Content-Length` before a body is buffered, so the ceiling holds even when the count does not — twenty 4K videos are not twenty photos.
export const MAX_GALLERY_SHARE_BYTES = 200 * A_MEGABYTE;

// INFO: REQUIREMENTS.md § 14. iPhone ProRAW tops out around 50MB and a panorama around 15MB, so nothing from the camera roll is refused.
export const MAX_IMAGE_SIZE = 50 * A_MEGABYTE;

// WARN: A presigned PUT is a single request with no resume, so this is an upload-reliability ceiling, not a storage one — raising it needs multipart upload, not a bigger number. 500MB is roughly one minute of 4K60 or seven of 1080p30.
export const MAX_VIDEO_SIZE = 500 * A_MEGABYTE;

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

/** The cap the given type is measured against. REQUIREMENTS.md § 14. */
export function maxSizeForMime(mime: string): number {
  return isVideoMime(mime) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
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
