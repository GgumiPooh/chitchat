"use client";

import type { Nullable } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";
import { toTransferFiles } from "./to-transfer-files";

export type UseFilePasteParams = {
  /**
   * The screen the paste belongs to. Required, and there is no default — a
   * `window` listener has no tree position of its own, so this is the only thing
   * standing in for the scoping `useFileDrop` gets from React's dispatch (§ 9.2.).
   */
  containerRef: RefObject<Nullable<HTMLElement>>;
  /** Refuses every paste while false. Each caller passes whatever hides the tray a paste would land in, exactly as `useFileDrop` does (§ 9.2.). */
  isEnabled?: boolean;
  onPaste: (files: File[]) => void;
};

/**
 * Pasting photos, videos and files into a screen that stages attachments
 * (REQUIREMENTS.md § 9.2.).
 *
 * INFO: Listens on `window` rather than on the field, so a paste lands whether or
 * not the composer holds focus — a `paste` fires at the focused element and bubbles,
 * and with nothing focused the engine dispatches it at `body`.
 *
 * INFO: This needs no `FileDropGuard` counterpart. A paste the app ignores inserts
 * text into whatever is focused or does nothing at all, where an ignored drop
 * navigates the window to the file and strands a standalone PWA (§ 9.2.).
 */
export function useFilePaste({ containerRef, isEnabled = true, onPaste }: UseFilePasteParams) {
  const onPasteRef = useRef(onPaste);

  // INFO: Read through a ref, so a caller passing a fresh closure every render cannot tear the listener down and rebuild it on every render of the room.
  useEffect(() => {
    onPasteRef.current = onPaste;
  }, [onPaste]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    const stage = (event: ClipboardEvent) => {
      if (!event.clipboardData || !isAimedAt(containerRef.current, event.target)) {
        return;
      }

      // WARN: REQUIREMENTS.md § 9.2. Read straight off the items, never gated on `types.includes("Files")` first. That sentinel is `useFileDrop`'s, and its reason — `DataTransfer.files` is empty during `dragover` — is a fact about dragging that no clipboard shares.
      const files = toTransferFiles(event.clipboardData);

      if (files.length === 0) {
        return;
      }

      // WARN: REQUIREMENTS.md § 9.2. Files win over any text riding the same clipboard, and this is what stops the text half being inserted into the composer alongside the attachment.
      event.preventDefault();
      onPasteRef.current(files);
    };

    // WARN: Not `passive`. A passive listener may not `preventDefault`, which is half the job here.
    window.addEventListener("paste", stage);

    return () => window.removeEventListener("paste", stage);
  }, [containerRef, isEnabled]);
}

/**
 * WARN: REQUIREMENTS.md § 9.2. What keeps a `window` listener from taking a paste
 * aimed at something covering the screen. A sibling overlay portalled over the room
 * — § 8.4.1.'s 절전 모드 surface takes focus on mount — is outside the container, and
 * a paste there would stage into a tray the user cannot see. `useFileDrop` is
 * scoped for free, because React dispatches a drop through the component tree.
 *
 * INFO: `body` is the target when nothing at all holds focus, which is the case
 * this hook exists to serve and is not something covering anything.
 */
function isAimedAt(container: Nullable<HTMLElement>, target: EventTarget | null): boolean {
  if (target === document.body || target === document.documentElement) {
    return true;
  }

  return target instanceof Node && (container?.contains(target) ?? false);
}
