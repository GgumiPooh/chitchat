"use client";

import { hasDataTransferFiles } from "@/shared/lib";
import { useState, type DragEvent } from "react";
import { toTransferFiles } from "./to-transfer-files";

/** The handlers the drop target spreads onto its own outermost element. */
export type FileDropHandlers = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

export type UseFileDropParams = {
  /** Refuses every drop while false. Each caller passes whatever hides the tray a drop would land in — a § 8.6. search, a selection, an editor or the viewer over it (§ 9.2.). */
  isEnabled?: boolean;
  onDrop: (files: File[]) => void;
};

/**
 * Dropping photos, videos and files onto a target (REQUIREMENTS.md § 9.2.).
 *
 * INFO: Desktop-only by nature rather than by a branch. Touch platforms fire no
 * drag events at all, so this needs no pointer or user-agent test to stay off
 * there — which is what keeps `AGENTS.md § 4.2.`'s one sanctioned UA branch the
 * only one.
 *
 * WARN: Counts a drag over one target and nothing more. The window guard that stops
 * a stray drop navigating the app away is `FileDropGuard`, mounted once on the shell
 * — it has to cover the screens that take no drop at all (§ 9.2.).
 */
export function useFileDrop({ isEnabled = true, onDrop }: UseFileDropParams) {
  // WARN: A counter, not a boolean. `dragenter` fires again for every child the cursor crosses and the matching `dragleave` arrives *after* it, so a boolean flickers off over every bubble the pointer passes.
  // WARN: State rather than a ref, and every write below is a functional update. The depth has to survive being adjusted during render (below), which a ref may not be.
  const [depth, setDepth] = useState(0);
  const isDropping = depth > 0;

  /**
   * WARN: Adjusted during render rather than from an effect, and it is not
   * cosmetic. Every handler below refuses a disabled target, so a drag in progress
   * when `isEnabled` goes false has its `dragenter`s counted and its `dragleave`s
   * dropped — the depth never returns to zero, and the overlay comes back lit over
   * a conversation with nothing being dragged over it the moment the target is
   * enabled again.
   */
  if (!isEnabled && isDropping) {
    setDepth(0);
  }

  const handlers: FileDropHandlers = {
    onDragEnter: (event) => {
      if (!isEnabled || !hasDataTransferFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      setDepth((current) => current + 1);
    },
    // WARN: `dragover` has to `preventDefault` on every single event, not only the first. The drop is refused outright otherwise — the default action is what the browser reads as "this target does not take drops".
    onDragOver: (event) => {
      if (!isEnabled || !hasDataTransferFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event) => {
      if (!isEnabled || !hasDataTransferFiles(event.dataTransfer)) {
        return;
      }

      setDepth((current) => Math.max(0, current - 1));
    },
    onDrop: (event) => {
      if (!isEnabled || !hasDataTransferFiles(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      setDepth(0);

      const files = toTransferFiles(event.dataTransfer);

      if (files.length > 0) {
        onDrop(files);
      }
    },
  };

  return { isDropping, handlers };
}
