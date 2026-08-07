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
      const { dataTransfer } = event;

      if (!dataTransfer || !hasDataTransferFiles(dataTransfer)) {
        return;
      }

      // WARN: Read *before* this handler prevents anything. `useFileDrop` sits on the two real targets and React dispatches from the root, which is below `window` in the bubble path — so a claimed drag arrives here already prevented, and that is the only signal distinguishing it from one nobody took.
      // WARN: And the refusal has to be said out loud. `preventDefault` alone makes the whole window a valid drop target, so 캘린더, 설정 and the emoticon screens advertised the copy cursor for a file they then discarded in silence. Left unset on a *claimed* drag this would overwrite the target's own `copy` with a refusal, and the browser delivers no `drop` at all to a target whose effect is `none` — the chat room would stop taking files entirely.
      if (!event.defaultPrevented) {
        dataTransfer.dropEffect = "none";
      }

      event.preventDefault();
    };

    // WARN: Not `passive`. A passive listener may not `preventDefault`, which is the whole job here.
    window.addEventListener("dragover", swallow);
    window.addEventListener("drop", swallow);

    return () => {
      window.removeEventListener("dragover", swallow);
      window.removeEventListener("drop", swallow);
    };
  }, []);

  return null;
}
