import { isIos } from "@/shared/lib";

/**
 * True only where the "add to home screen" guidance is actionable: iOS Safari,
 * not yet installed (`REQUIREMENTS.md § 7.`). Browser-only — call it from an effect.
 */
export function isIosBrowserTab() {
  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIos() && !isInstalled;
}
