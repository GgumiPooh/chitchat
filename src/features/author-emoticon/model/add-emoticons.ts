import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonImageDraft } from "@/features/upload-media/@x/author-emoticon";
import { isAllowedEmoticonAsset } from "@/shared/config";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon } from "../api/write-emoticon";

export type BulkAddResult = {
  added: Emoticon[];
  failedCount: number;
};

/**
 * REQUIREMENTS.md § 13.4. A pile of images, one item each — the path that exists so
 * a whole authored set does not have to be added one form at a time. Neither the
 * editor nor the audio slot is offered here; both are single-item decisions, and an
 * item can be given a sound afterwards by editing it.
 *
 * WARN: One file at a time, deliberately. Twenty parallel presigned PUTs on a phone
 * network are twenty ways to time out, and `onAdded` exists so the grid fills in as
 * they land rather than after the last one.
 */
export async function addEmoticonsFromFiles(
  packId: string,
  files: File[],
  onAdded: (emoticon: Emoticon) => void,
): Promise<BulkAddResult> {
  const added: Emoticon[] = [];
  let failedCount = 0;

  for (const file of files) {
    const emoticon = await addOne(packId, file);

    if (!emoticon) {
      failedCount += 1;
      continue;
    }

    added.push(emoticon);
    onAdded(emoticon);
  }

  return { added, failedCount };
}

async function addOne(packId: string, file: File) {
  let uploadedKey: string | undefined;

  try {
    const draft = await toEmoticonImageDraft(file);

    // INFO: The preview is never rendered on this path — the grid reads the registered item back through its asset URL — so it is released as soon as the size has been read off it.
    URL.revokeObjectURL(draft.previewUrl);

    // INFO: REQUIREMENTS.md § 14. A courtesy check, so an oversized file fails before it is uploaded rather than at registration.
    if (!isAllowedEmoticonAsset("image", draft.file.type, draft.file.size)) {
      return null;
    }

    uploadedKey = await uploadEmoticonAsset("image", draft.file);

    return await createEmoticon(packId, {
      imageKey: uploadedKey,
      width: draft.width,
      height: draft.height,
    });
  } catch {
    // INFO: § 13.3. An object that landed for an item that never got registered is unreachable, so it is given back rather than left in the bucket.
    void discardEmoticonAssets(uploadedKey ? [uploadedKey] : []);

    return null;
  }
}
