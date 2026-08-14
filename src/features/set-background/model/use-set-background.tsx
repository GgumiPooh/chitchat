"use client";

import type { MediaId, Nullable } from "@/shared/lib";
import { useCallback, useState, type ReactNode } from "react";
import { SetBackgroundSheet, type BackgroundSource } from "../ui/set-background-sheet";

export type SetBackgroundControl = {
  /** Hand this to `MediaViewer`'s `onSetBackground`. */
  open: (mediaId: MediaId, isVideo: boolean) => void;
  /** Render this beside the viewer, never inside its conditional. */
  sheet: ReactNode;
};

/**
 * REQUIREMENTS.md § 12.1. The whole 배경으로 설정 affordance for a screen that shows
 * the § 7.10. viewer — the state, the handler and the sheet as one thing.
 *
 * INFO: A hook rather than two copies of four lines. The chat room and the library
 * both mount the viewer and neither may import the other (§ 2.), so the wiring was
 * duplicated verbatim, comment included — and the next change to it (a busy state, a
 * second slot) would have had to be made twice.
 *
 * WARN: The sheet is returned separately so the caller mounts it **outside** the
 * viewer's own conditional. Rendered inside, dismissing the viewer unmounts the
 * sheet mid-write and the copy is left orphaned in R2.
 */
export function useSetBackground(): SetBackgroundControl {
  const [source, setSource] = useState<Nullable<BackgroundSource>>(null);
  const open = useCallback((mediaId: MediaId, isVideo: boolean) => {
    setSource({ id: mediaId, isVideo });
  }, []);
  const close = useCallback(() => setSource(null), []);

  return {
    open,
    sheet: <SetBackgroundSheet source={source} onClose={close} />,
  };
}
