import { ARCHIVE_DOWNLOAD_STAGGER, toMediaDownloadUrl } from "@/shared/config";

/**
 * Saves the given originals to disk (REQUIREMENTS.md § 10.).
 *
 * WARN: No `download` attribute, and no `fetch` of the bytes. The route answers a
 * 302 to R2 and the spec drops `download` once the navigation resolves
 * cross-origin (§ 9.), so what actually saves the file is the
 * `Content-Disposition` signed into the presigned GET — which means a plain
 * navigation per file. Fetching the blob instead would need R2's CORS policy to
 * allow GET as well as PUT (§ 15.), and would hold a 500MB video in memory.
 *
 * WARN: Staggered. Several navigations started in the same tick collapse into
 * one — the browser treats the later ones as the same gesture and drops them.
 */
export async function downloadMedia(ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    if (index > 0) {
      await delay(ARCHIVE_DOWNLOAD_STAGGER);
    }

    saveOne(id);
  }
}

function saveOne(id: string) {
  const anchor = document.createElement("a");

  anchor.href = toMediaDownloadUrl(id);
  // INFO: Kept out of the document. A detached anchor still navigates on `click`, and appending one would flash a stray node into the grid's layout.
  anchor.rel = "noopener";
  anchor.click();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
