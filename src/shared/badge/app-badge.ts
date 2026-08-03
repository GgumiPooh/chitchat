import { safelyRun } from "@/shared/lib";

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * REQUIREMENTS.md § 16.1. The home-screen icon badge, written from the shell the
 * same way `sw.js` writes it from a push. Absent on iOS Safari tabs and on older
 * desktops, hence the optional calls.
 */
export function updateAppBadge(unreadCount: number): void {
  const badging = navigator as BadgingNavigator;

  safelyRun(() => {
    void (unreadCount > 0 ? badging.setAppBadge?.(unreadCount) : badging.clearAppBadge?.());
  });
}
