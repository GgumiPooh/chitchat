import type { Maybe, Optional } from "@/shared/lib";
import { toBlurhashAverage } from "@/shared/ui";

// WARN: DESIGN.md § 7.16. The same 20% `ChatBackdrop` draws its wash at, and the two MUST move together — what borders the chrome is the photo *under* that wash, so the bare average publishes a colour visibly deeper than the room beside it.
const WASH_AMOUNT = "20%";

/**
 * REQUIREMENTS.md § 12.2. The wallpaper's own colour, composited under the wash it is
 * seen through, for `ChatScreen` to wear as its own background — that box is the one
 * iOS 26 Safari samples its status bar and toolbar from while the room is on screen
 * (DESIGN.md § 3.3.), since it covers `body` entirely.
 *
 * WARN: A plain function called during the render, never an effect, and that is what makes a cold launch right. iOS 26 samples the chrome at the first paint and re-samples for nothing afterwards, so a tint published after hydration reaches an element Safari has already read.
 *
 * WARN: Necessary and not sufficient on its own. What the sampler reads is the pixels at the top edge, so everything painted over this box has to agree with it — `useBlurhashStyle`'s ungated `background-color` is the other half, and DESIGN.md § 3.3. holds both.
 *
 * WARN: A `color-mix` against the live token rather than three resolved numbers. `--color-chat-scrim` moves with the theme (DESIGN.md § 5.2.), so a value resolved here is baked against whichever theme was up when the wallpaper landed — and a theme swapped while the room is on screen fires no signal this could recompute on.
 */
export function toChromeTint(blurhash: Maybe<string>): Optional<string> {
  const average = toBlurhashAverage(blurhash);

  if (!average) {
    return undefined;
  }

  return `color-mix(in srgb, var(--color-chat-scrim) ${WASH_AMOUNT}, ${average})`;
}
