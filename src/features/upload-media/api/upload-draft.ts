import type { ArchiveMedia, MediaDraft } from "@/entities/media";
import { request } from "@/shared/api";
import { MEDIA_PATH, MEDIA_UPLOAD_URL_PATH, type MediaUploadScope } from "@/shared/config";
import { holdAwake, type Nullable } from "@/shared/lib";

type UploadTicket = {
  r2Key: string;
  uploadUrl: string;
  // INFO: REQUIREMENTS.md § 9.1. Both null for a file attachment, which has no thumbnail to sign a second PUT for.
  thumbnailUploadUrl: Nullable<string>;
  thumbnailMime: Nullable<string>;
};

export type UploadProgress = (loadedBytes: number) => void;

export type UploadDraftOptions = {
  // INFO: REQUIREMENTS.md § 12. The key prefix the object lands under, which is also what its registration is authorized against.
  scope?: MediaUploadScope;
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
  { scope = "chat", onProgress = NO_PROGRESS }: UploadDraftOptions = {},
): Promise<ArchiveMedia> {
  // WARN: REQUIREMENTS.md § 8.4.1. Held here rather than at each caller, because the bytes are already in R2 by the time the registration runs — a dormancy landing between the two would leave an object nothing points at and no way to retry it.
  const release = holdAwake();

  try {
    const ticket = await requestTicket(draft, scope);

    await putWithProgress(ticket.uploadUrl, draft.file, draft.mime, onProgress);

    // INFO: No progress for the thumbnail — it is a few tens of KB against an original measured in MB, so it would only make the bar jump.
    if (draft.thumbnail && ticket.thumbnailUploadUrl && ticket.thumbnailMime) {
      await putWithProgress(
        ticket.thumbnailUploadUrl,
        draft.thumbnail,
        ticket.thumbnailMime,
        () => {},
      );
    }

    return await registerUpload(draft, ticket.r2Key);
  } finally {
    release();
  }
}

async function requestTicket(draft: MediaDraft, scope: MediaUploadScope): Promise<UploadTicket> {
  const response = await request(MEDIA_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime: draft.mime, size: draft.file.size, scope }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_UPLOAD_URL_PATH} responded ${response.status}`);
  }

  return response.json() as Promise<UploadTicket>;
}

async function registerUpload(draft: MediaDraft, r2Key: string): Promise<ArchiveMedia> {
  const response = await request(MEDIA_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      r2Key,
      width: draft.width,
      height: draft.height,
      durationMs: draft.durationMs,
      // INFO: REQUIREMENTS.md § 9. Encoded from the very thumbnail the PUT above uploaded, so the placeholder and the object it stands in for cannot disagree.
      blurhash: draft.blurhash,
      filename: draft.filename,
      // INFO: REQUIREMENTS.md § 9.3. Already in the wire form the column stores — a draft carries integers, and only what renders converts to `0`–`1`.
      waveformPeaks: draft.waveformPeaks,
    }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_PATH} responded ${response.status}`);
  }

  const { media } = (await response.json()) as { media: ArchiveMedia };

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
