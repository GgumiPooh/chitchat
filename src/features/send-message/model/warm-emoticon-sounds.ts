"use client";

import type { Emoticon } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { warmAnimatedImage, warmSound } from "@/shared/lib";

// INFO: REQUIREMENTS.md § 13.6. Narrower than the image warm's own cap: a sound is warmed for the tab the reader is on and never for the ones either side of it, since a picture is what a swipe reveals and a sound is only ever what a tap asks for.
// WARN: Chosen against `MAX_CACHED_BYTES` and not just against the round trips. A tab warmed past that budget evicts its *own* head — the first cells, which are the ones a thumb reaches — so this stays well inside it for the two-second blip § 13.6. describes rather than for `MAX_EMOTICON_AUDIO_SIZE`.
const MAX_WARMED_SOUNDS_PER_TAB = 24;

/**
 * REQUIREMENTS.md § 13.6. Reads a tab's sounds into the shared player's cache, so a
 * pick sounds at the moment its picture appears rather than a round trip later.
 *
 * WARN: The open tab only. Every other tab pays for its first pick and no more —
 * `playSound` warms what it missed on.
 */
export function warmEmoticonSounds(items: Emoticon[]): void {
  items
    .filter(({ hasAudio }) => hasAudio)
    .slice(0, MAX_WARMED_SOUNDS_PER_TAB)
    .forEach(({ version, hasAnimated, id }) => {
      void warmSound(toEmoticonAssetUrl(id, "audio", version));
      // INFO: § 13.6. A sounding emoticon's animation is the other half of what `useSyncedEmoticonPlayback` waits on, so it is read in beside the sound.
      if (hasAnimated) {
        void warmAnimatedImage(toEmoticonAssetUrl(id, "animated-image", version));
      }
    });
}
