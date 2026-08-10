"use client";

import { useEffect } from "react";
import { dismissDeliveredNotifications } from "./push-registration";

/**
 * REQUIREMENTS.md § 16.1. Clears Notification Center whenever the user enters the
 * app, so the banners they were alerted with do not outlive the reading of them.
 *
 * WARN: Not the mount alone. An installed iOS PWA is resumed rather than reloaded
 * (§ 15.1.), so the launch every banner accumulated for is one this effect runs on
 * exactly once, and never again for the life of the process.
 */
export function useNotificationSweep() {
  useEffect(() => {
    void dismissDeliveredNotifications();

    // INFO: § 8.4. iOS is inconsistent about which event a PWA app-switch produces, so both are observed; a sweep that finds nothing costs nothing.
    document.addEventListener("visibilitychange", sweepWhenVisible);
    window.addEventListener("pageshow", sweepWhenVisible);

    return () => {
      document.removeEventListener("visibilitychange", sweepWhenVisible);
      window.removeEventListener("pageshow", sweepWhenVisible);
    };

    function sweepWhenVisible() {
      // INFO: Both events also fire on the way out, and a departure is the one moment the banners must stay — the user is leaving to read them.
      if (document.visibilityState !== "visible") {
        return;
      }

      void dismissDeliveredNotifications();
    }
  }, []);
}
