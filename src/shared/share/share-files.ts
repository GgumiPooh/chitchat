import {
  MAX_GALLERY_SHARE_BYTES,
  MAX_GALLERY_SHARE_FILES,
  extensionForMime,
  toMediaDownloadUrl,
} from "@/shared/config";
import { isBrowser } from "@/shared/lib";

/** What `navigator.share` did with what it was handed. */
export type ShareOutcome = "shared" | "dismissed" | "blocked";

/**
 * Whether this platform can hand files to the OS share sheet.
 *
 * INFO: REQUIREMENTS.md § 10. The share sheet is the *only* route from a web page
 * into the iOS photo library — a `Content-Disposition: attachment` download lands in
 * Files and never in Photos, whatever the app does.
 *
 * WARN: A real one-byte `File`, not an empty one. `canShare` inspects the type of
 * what it is given, and an implementation that answers on content rather than on the
 * declared type answers wrong for a zero-length body.
 */
export function canShareFiles(): boolean {
  if (!isBrowser() || typeof navigator.canShare !== "function") {
    return false;
  }

  const probe = new File([new Uint8Array(1)], "probe.jpg", { type: "image/jpeg" });

  try {
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Whether the OS share sheet can be offered a line of text at all. */
export function canShareText(): boolean {
  return isBrowser() && typeof navigator.share === "function";
}

/** Whether a selection is small enough to be buffered for the share sheet at all. */
export function isShareableSelection(ids: string[]): boolean {
  return ids.length > 0 && ids.length <= MAX_GALLERY_SHARE_FILES;
}

/**
 * Buffers the selected originals so they can be shared as files.
 *
 * WARN: Rejects rather than returning a partial list. A share sheet holding six of
 * the nine photos the user picked reads as a successful save of all nine, so a
 * refusal the caller can fall back from is the safer failure.
 *
 * WARN: `Content-Length` is checked before the body is read. It is CORS-safelisted,
 * so it survives the 302 into R2 (§ 15.) — and checking it here is what keeps a
 * 500MB video from being buffered before the ceiling is noticed.
 */
export async function collectShareFiles(
  ids: string[],
  onProgress: (count: number) => void,
): Promise<File[]> {
  const files: File[] = [];
  let totalBytes = 0;

  for (const id of ids) {
    const response = await fetch(toMediaDownloadUrl(id));

    if (!response.ok) {
      throw new Error("media_unavailable");
    }

    totalBytes += Number(response.headers.get("content-length") ?? 0);

    if (totalBytes > MAX_GALLERY_SHARE_BYTES) {
      throw new Error("selection_too_large");
    }

    const blob = await response.blob();

    files.push(new File([blob], toShareFileName(id, blob.type), { type: blob.type }));
    onProgress(files.length);
  }

  return files;
}

/**
 * WARN: Must be reached from inside the click handler that the user's tap started.
 * iOS spends the transient activation on the first `await`, and a `share` that lands
 * after it is gone rejects with `NotAllowedError` — which is what `blocked` reports,
 * so the caller can ask for the one extra tap instead of failing silently.
 */
export async function shareFiles(files: File[]): Promise<ShareOutcome> {
  return toOutcome(() => navigator.share({ files }));
}

/** REQUIREMENTS.md § 8.11. The text of a message, handed to the same sheet the files go to. */
export async function shareText(text: string): Promise<ShareOutcome> {
  return toOutcome(() => navigator.share({ text }));
}

async function toOutcome(share: () => Promise<void>): Promise<ShareOutcome> {
  try {
    await share();

    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "dismissed" : "blocked";
  }
}

function toShareFileName(id: string, mime: string): string {
  return `${id}.${extensionForMime(mime)}`;
}
