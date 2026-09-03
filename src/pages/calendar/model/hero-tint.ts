import type { Maybe } from "@/shared/lib";
import { toBlurhashAverage } from "@/shared/ui";

// WARN: The same 30% as the top stop of `DDayHero`'s scrim (`from-hero-scrim/30`), and the two MUST move together — what borders the status bar is the photo under that stop, not the bare average.
const TOP_WASH_AMOUNT = "30%";

/**
 * REQUIREMENTS.md § 12.2. The hero's own colour at its top edge, for `body` to wear
 * while 캘린더 is on screen — the transparent header is what borders iOS 26's status
 * bar there (DESIGN.md § 3.3.), so Safari falls back to `body`, and `canvas` under a
 * photo reads as a white strip bolted onto it.
 */
export function toHeroTint(blurhash: Maybe<string>): string {
  const base = toBlurhashAverage(blurhash) ?? "var(--color-primary)";

  return `color-mix(in srgb, var(--color-hero-scrim) ${TOP_WASH_AMOUNT}, ${base})`;
}
