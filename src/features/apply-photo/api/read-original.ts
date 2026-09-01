import { readMediaFile } from "@/shared/api";
import { MEDIA_PATH } from "@/shared/config";
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
export function readOriginalFile(mediaId: MediaId): Promise<File> {
  return readMediaFile(`${MEDIA_PATH}/${mediaId}?variant=edit`, mediaId);
}
