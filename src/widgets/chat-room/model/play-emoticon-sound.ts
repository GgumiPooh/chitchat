import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { playSound, type Maybe } from "@/shared/lib";

export type EmoticonSound = Pick<Emoticon, "id" | "version" | "hasAudio">;

/**
 * REQUIREMENTS.md § 13.6. The sound of an emoticon that carries one, on the
 * shared player — a second emoticon cuts the first off rather than overlapping it.
 */
export function playEmoticonSound(emoticon: Maybe<EmoticonSound>): void {
  if (!emoticon?.hasAudio) {
    return;
  }

  playSound(toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version));
}
