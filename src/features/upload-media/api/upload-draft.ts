import type { MediaDraft, MediaUpload } from "@/entities/media";
import { request } from "@/shared/api";
import { MEDIA_UPLOAD_URL_PATH, type MediaUploadScope } from "@/shared/config";
import { holdAwake, type Nullable } from "@/shared/lib";
import { optimizeDraft } from "../model/optimize-draft";
import type { EncodeProgress } from "../model/optimize-result";

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
  // INFO: § 9. The re-encode that precedes the PUT, reported separately because it is its own phase — the bar below counts bytes reaching R2, which have not started moving yet.
  onEncodeProgress?: EncodeProgress;
  // WARN: § 9. What will actually be PUT, once the re-encode has settled it. `onProgress` counts bytes against this and not against the draft, so a caller totalling drafts would leave the bar stuck at the compression ratio.
  onUploadSize?: (bytes: number) => void;
};

const NO_PROGRESS: UploadProgress = () => {};

/**
 * Puts one attachment in R2 and answers the `MediaUpload` its consumer request
 * will register and attach in the same transaction (REQUIREMENTS.md § 9.).
 *
 * The bytes never pass through our server — a presigned PUT is what gets an
 * iPhone photo past Vercel's 4.5MB request body limit.
 */
export async function uploadDraft(
  draft: MediaDraft,
  {
    scope = "chat",
    onProgress = NO_PROGRESS,
    onEncodeProgress,
    onUploadSize,
  }: UploadDraftOptions = {},
): Promise<MediaUpload> {
  // WARN: REQUIREMENTS.md § 8.4.1. Held here rather than at each caller, because a dormancy landing between the PUT and the consumer request that references its key would leave an object in R2 with no reservation left to retry against.
  const release = holdAwake();

  try {
    // WARN: Before the ticket, not after. The ticket is signed against the mime and size of what is actually uploaded, so a re-encode that ran afterwards would be refused by R2 on the signature.
    const optimized = await optimizeDraft(draft, scope, onEncodeProgress);

    onUploadSize?.(optimized.file.size);

    // WARN: `draft.mime` whenever the optimizer handed the original back — `File.type` is routinely empty for a pick the OS had no type for, and `toStoredMime` resolved that from the name at the pick. Signing the raw type instead 400s the ticket and fails the send outright.
    const uploadMime = optimized.file === draft.file ? draft.mime : optimized.file.type;
    const ticket = await requestTicket(uploadMime, optimized.file.size, draft, scope);

    await putWithProgress(ticket.uploadUrl, optimized.file, uploadMime, onProgress);

    // INFO: No progress for the thumbnail — it is a few tens of KB against an original measured in MB, so it would only make the bar jump.
    if (draft.thumbnail && ticket.thumbnailUploadUrl && ticket.thumbnailMime) {
      await putWithProgress(
        ticket.thumbnailUploadUrl,
        draft.thumbnail,
        ticket.thumbnailMime,
        () => {},
      );
    }

    return {
      r2Key: ticket.r2Key,
      // INFO: § 8.3. The optimizer's box wins whenever it re-encoded, since the row has to record the resolution the stored object actually has.
      width: optimized.width ?? draft.width,
      height: optimized.height ?? draft.height,
      durationMs: draft.durationMs,
      // INFO: REQUIREMENTS.md § 9. Encoded from the very thumbnail the PUT above uploaded, so the placeholder and the object it stands in for cannot disagree.
      blurhash: draft.blurhash,
      // WARN: § 9.1. The optimizer's name whenever it replaced the file — `optimizeAudio` writes AAC/MP4 out as `.m4a`, and the draft still holds the `.mp3` the user picked, which is the name 보관함 would list and 저장 would hand over.
      filename:
        draft.filename && optimized.file !== draft.file ? optimized.file.name : draft.filename,
      // INFO: REQUIREMENTS.md § 9.3. Already in the wire form the column stores — a draft carries integers, and only what renders converts to `0`–`1`.
      waveformPeaks: draft.waveformPeaks,
    };
  } finally {
    release();
  }
}

async function requestTicket(
  mime: string,
  size: number,
  draft: MediaDraft,
  scope: MediaUploadScope,
): Promise<UploadTicket> {
  const response = await request(MEDIA_UPLOAD_URL_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // WARN: `thumbnailMime` is what the browser actually encoded, and the ticket signs the `_thumb` PUT for it — omitting it takes the § 9. JPEG default, which is what an engine with no AVIF encoder produced.
    body: JSON.stringify({
      mime,
      size,
      scope,
      ...(draft.thumbnailMime ? { thumbnailMime: draft.thumbnailMime } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`POST ${MEDIA_UPLOAD_URL_PATH} responded ${response.status}`);
  }

  return response.json() as Promise<UploadTicket>;
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
