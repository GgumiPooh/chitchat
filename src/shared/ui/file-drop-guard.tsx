"use client";

import { hasDataTransferFiles } from "@/shared/lib";
import { useEffect } from "react";

/**
 * Swallows a file drop that lands anywhere the app does not take one
 * (REQUIREMENTS.md § 9.2.).
 *
 * WARN: Mounted once on the shell, never inside the drop targets. The hazard is
 * app-global — the browser navigates to any file dropped on any screen, which in a
 * standalone PWA replaces the app with a bare asset view and no way back — while the
 * two targets that take drops are only two of the five screens under the shell.
 */
export function FileDropGuard() {
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      if (hasDataTransferFiles(event)) {
        event.preventDefault();
      }
    };

    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);

    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  return null;
}
