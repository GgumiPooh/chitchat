import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetDownloadUrl, type EmoticonSlot } from "@/shared/config";
import { toast } from "@/shared/ui";

/**
 * REQUIREMENTS.md § 13.4. Saves one stored asset to disk, the way `downloadMedia`
 * does (§ 10.): a detached-anchor navigation, with no `download` attribute and no
 * `fetch` — the route 302s into R2, so only the disposition signed into the presigned
 * GET saves the file.
 */
export function downloadEmoticonAsset(emoticon: Emoticon, slot: EmoticonSlot): void {
  const anchor = document.createElement("a");

  anchor.href = toEmoticonAssetDownloadUrl(emoticon.id, slot, emoticon.version);
  anchor.rel = "noopener";
  anchor.click();
  toast.success("다운로드하고 있어요");
}
