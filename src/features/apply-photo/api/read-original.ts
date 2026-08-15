import { request } from "@/shared/api";
import { MEDIA_PATH, extensionForMime } from "@/shared/config";
import type { MediaId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 12.1. The stored original as a `File`, so 사진 사용하기 can crop
 * it before it is worn.
 *
 * WARN: The `edit` variant, which streams the bytes from this origin — never the
 * display URL. That one answers a 302 into R2, so a canvas drawn from it is tainted,
 * and asking for it in CORS mode is what `CLAUDE.md § 5.3.` forbids: the photo is
 * downloaded a second time under its own cache entry and the read fails on a refresh.
 */
export async function readOriginalFile(mediaId: MediaId): Promise<File> {
  const path = `${MEDIA_PATH}/${mediaId}?variant=edit`;
  const response = await request(path);

  if (!response.ok) {
    throw new Error(`GET ${path} responded ${response.status}`);
  }

  const blob = await response.blob();

  // INFO: R2 keys carry no name (§ 9.1.), and the pipeline behind this reads the extension off the one it is given — `applyEdit` and `cropVideo` both rename their output from it.
  return new File([blob], `${mediaId}.${extensionForMime(blob.type)}`, { type: blob.type });
}
