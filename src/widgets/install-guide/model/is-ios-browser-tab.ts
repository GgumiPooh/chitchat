import { isIos, isStandalone } from "@/shared/lib";

/**
 * True only where the "add to home screen" guidance is actionable: iOS Safari,
 * not yet installed (`REQUIREMENTS.md § 7.`). Browser-only.
 */
export function isIosSafariBrowserTab(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!isIos() || isStandalone()) {
    return false;
  }

  const ua = window.navigator.userAgent;
  // Exclude non-Safari browsers or in-app webviews on iOS that do not support Safari's Share -> Add to Home Screen flow
  const isOtherIosBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|KAKAOTALK|NAVER|Line|Instagram|FBAN|FBAV/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !isOtherIosBrowser;

  return isSafari;
}

export const isIosBrowserTab = isIosSafariBrowserTab;
