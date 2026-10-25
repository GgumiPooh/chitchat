import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { getIsOfficeMode, playSound, type EmoticonPackId, type Maybe } from "@/shared/lib";

export type EmoticonSound = Pick<Emoticon, "id" | "version" | "hasAudio"> & {
  packId?: EmoticonPackId;
};

/**
 * REQUIREMENTS.md § 13.6. The sound of an emoticon that carries one, on the
 * shared player — a second emoticon cuts the first off rather than overlapping it.
 */
export function playEmoticonSound(
  emoticon: Maybe<EmoticonSound>,
  isPackHidden?: (packId: EmoticonPackId) => boolean,
): void {
  if (!emoticon?.hasAudio) {
    return;
  }

  if (getIsOfficeMode() && emoticon.packId && isPackHidden?.(emoticon.packId)) {
    return;
  }

  playSound(toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version));
}
