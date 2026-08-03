/**
 * True only where the "add to home screen" guidance is actionable: iOS Safari,
 * not yet installed (`REQUIREMENTS.md § 7.`). Browser-only — call it from an effect.
 */
export function isIosBrowserTab() {
  const { maxTouchPoints, userAgent } = window.navigator;

  // INFO: iPadOS 13+ reports a Macintosh user agent, so touch points are what separate it from a desktop Mac.
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

  const isInstalled =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIos && !isInstalled;
}
