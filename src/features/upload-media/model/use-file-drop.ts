"use client";

import { useEffect, useState, type DragEvent } from "react";

/** The handlers the drop target spreads onto its own outermost element. */
export type FileDropHandlers = {
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

export type UseFileDropParams = {
  /** Refuses every drop while false — the composer is put away during a § 8.6. search, and a drop then would stage into a tray nothing can send. */
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
 */
export function useFileDrop({ isEnabled = true, onDrop }: UseFileDropParams) {
  // WARN: A counter, not a boolean. `dragenter` fires again for every child the cursor crosses and the matching `dragleave` arrives *after* it, so a boolean flickers off over every bubble the pointer passes.
  // WARN: State rather than a ref, and every write below is a functional update. The depth has to survive being adjusted during render (below), which a ref may not be.
  const [depth, setDepth] = useState(0);
  const isDropping = depth > 0;

  /**
   * WARN: The window guard, and it is not optional. A drop that misses the target
   * is a navigation the browser performs by default — in a standalone PWA that
   * replaces the app with a bare asset view and no way back.
   */
  useEffect(() => {
    const swallow = (event: Event) => {
      if (hasFiles(event as unknown as DragEvent)) {
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
      if (!isEnabled || !hasFiles(event)) {
        return;
      }

      event.preventDefault();
      setDepth((current) => current + 1);
    },
    // WARN: `dragover` has to `preventDefault` on every single event, not only the first. The drop is refused outright otherwise — the default action is what the browser reads as "this target does not take drops".
    onDragOver: (event) => {
      if (!isEnabled || !hasFiles(event)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event) => {
      if (!isEnabled || !hasFiles(event)) {
        return;
      }

      setDepth((current) => Math.max(0, current - 1));
    },
    onDrop: (event) => {
      if (!isEnabled || !hasFiles(event)) {
        return;
      }

      event.preventDefault();
      setDepth(0);

      const files = toDroppedFiles(event);

      if (files.length > 0) {
        onDrop(files);
      }
    },
  };

  return { isDropping, handlers };
}

// WARN: `types`, never `files` — `DataTransfer.files` is empty on `dragover` for security, so a guard reading it would never arm. This is also what keeps a dragged selection of text from lighting the overlay up.
function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * WARN: A dropped **folder** arrives as a `File` with no type and no bytes, and
 * uploading it would put an empty object in the bucket under the folder's name.
 * `webkitGetAsEntry` is the only thing that tells the two apart — a real empty file
 * is indistinguishable from a directory by size alone.
 */
function toDroppedFiles(event: DragEvent): File[] {
  const items = Array.from(event.dataTransfer.items);

  if (items.length === 0) {
    return Array.from(event.dataTransfer.files);
  }

  return items.flatMap((item) => {
    const file = item.kind === "file" ? item.getAsFile() : null;

    return file && !item.webkitGetAsEntry()?.isDirectory ? [file] : [];
  });
}
