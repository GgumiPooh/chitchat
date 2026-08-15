"use client";

import type { MediaId, Nullable } from "@/shared/lib";
import { useCallback, useState, type ReactNode } from "react";
import { ApplyPhotoSheet, type ApplyPhotoSource } from "../ui/apply-photo-sheet";

export type ApplyPhotoControl = {
  /** Hand this to `MediaViewer`'s `onApplyPhoto`. */
  open: (mediaId: MediaId, isVideo: boolean) => void;
  /** Render this beside the viewer, never inside its conditional. */
  sheet: ReactNode;
};

/**
 * REQUIREMENTS.md § 12.1. The whole 사진 사용하기 affordance for a screen that shows
 * the § 7.10. viewer — the state, the handler and the sheet as one thing.
 *
 * INFO: A hook rather than two copies of four lines. The chat room and the library
 * both mount the viewer and neither may import the other (§ 2.), so the wiring was
 * duplicated verbatim, comment included — and the next change to it would have had to
 * be made twice.
 *
 * WARN: The sheet is returned separately so the caller mounts it **outside** the
 * viewer's own conditional. Rendered inside, dismissing the viewer unmounts the flow
 * mid-write and the upload is left orphaned in R2.
 */
export function useApplyPhoto(): ApplyPhotoControl {
  const [source, setSource] = useState<Nullable<ApplyPhotoSource>>(null);
  const open = useCallback((mediaId: MediaId, isVideo: boolean) => {
    setSource({ id: mediaId, isVideo });
  }, []);
  const close = useCallback(() => setSource(null), []);

  return {
    open,
    sheet: <ApplyPhotoSheet source={source} onClose={close} />,
  };
}
