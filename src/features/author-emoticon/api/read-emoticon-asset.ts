import type { Emoticon } from "@/entities/emoticon";
import { request } from "@/shared/api";
import { extensionForMime, toEmoticonAssetEditUrl } from "@/shared/config";

/**
 * REQUIREMENTS.md § 13.4. The stored still as a `File`, so the sheet can run it back
 * through 누끼 and 영역 자르기.
 *
 * WARN: The `edit` variant, never the display URL — that one answers a 302 into R2,
 * which taints a canvas, and fetching it in CORS mode is what `CLAUDE.md § 5.3.` forbids.
 */
export async function readEmoticonStillFile(emoticon: Emoticon): Promise<File> {
  const path = toEmoticonAssetEditUrl(emoticon.id, emoticon.version);
  const response = await request(path);

  if (!response.ok) {
    throw new Error(`GET ${path} responded ${response.status}`);
  }

  const blob = await response.blob();

  // INFO: R2 keys carry no name, and `applyEdit` renames its output from the extension it is handed.
  return new File([blob], `${emoticon.id}.${extensionForMime(blob.type)}`, { type: blob.type });
}
