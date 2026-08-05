import type { GalleryMedia, MediaDraft } from "@/entities/media";
import { MEDIA_PATH, MEDIA_UPLOAD_URL_PATH } from "@/shared/config";

type UploadTicket = {
  r2Key: string;
  uploadUrl: string;
  thumbnailUploadUrl: string;
  thumbnailMime: string;
};

export type UploadProgress = (loadedBytes: number) => void;

export type UploadDraftOptions = {
  // INFO: REQUIREMENTS.md § 10. What puts a photo in the gallery without a message behind it. A chat attachment leaves this alone and earns its place there through `message_media`.
  addToGallery?: boolean;
  onProgress?: UploadProgress;
};

const NO_PROGRESS: UploadProgress = () => {};

/**
 * Puts one attachment in R2 and registers it, answering the `media` row the
 * message will point at (REQUIREMENTS.md § 9.).
 *
 * The bytes never pass through our server — a presigned PUT is what gets an
 * iPhone photo past Vercel's 4.5MB request body limit.
 */
export async function uploadDraft(
  draft: MediaDraft,
  { addToGallery = false, onProgress = NO_PROGRESS }: UploadDraftOptions = {},
): Promise<GalleryMedia> {
  const ticket = await requestTicket(draft);

  await putWithProgress(ticket.uploadUrl, draft.file, draft.mime, onProgress);
  // INFO: No progress for the thumbnail — it is a few tens of KB against an original measured in MB, so it would only make the bar jump.
  await putWithProgress(ticket.thumbnailUploadUrl, draft.thumbnail, ticket.thumbnailMime, () => {});

  return registerUpload(draft, ticket.r2Key, addToGallery);
}

async function requestTicket(draft: MediaDraft): Promise<UploadTicket> {
  const response = await fetch(MEDIA_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: draft.mime, size: draft.file.size }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_UPLOAD_URL_PATH} responded ${response.status}`);
  }

  return response.json() as Promise<UploadTicket>;
}

async function registerUpload(
  draft: MediaDraft,
  r2Key: string,
  addToGallery: boolean,
): Promise<GalleryMedia> {
  const response = await fetch(MEDIA_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      r2Key,
      width: draft.width,
      height: draft.height,
      durationMs: draft.durationMs,
      addToGallery,
    }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: GalleryMedia };

  return media;
}

/**
 * WARN: `XMLHttpRequest`, not `fetch`. Upload progress needs `upload.onprogress`,
 * and `fetch` still has no equivalent — a request-body stream is not implemented
 * in WebKit. This bar is the real byte count reaching R2, which is the whole
 * reason the upload is direct.
 */
function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: UploadProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", url);
    // WARN: Must match what the URL was signed for, or R2 rejects the signature (§ 9.).
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () => reject(new Error("upload failed"));
    request.onabort = () => reject(new Error("upload aborted"));

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }

      reject(new Error(`PUT responded ${request.status}`));
    };

    request.send(body);
  });
}
