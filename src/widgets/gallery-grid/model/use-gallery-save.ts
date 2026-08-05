"use client";

import { MAX_GALLERY_SHARE_FILES } from "@/shared/config";
import { useIsCoarsePointer, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useState } from "react";
import { downloadGalleryMedia } from "./download-gallery-media";
import {
  canShareFiles,
  collectShareFiles,
  isShareableSelection,
  shareFiles,
} from "./share-gallery-media";

export type GallerySaveProgress = {
  preparedCount: number;
  totalCount: number;
};

/**
 * "저장" for a gallery selection (REQUIREMENTS.md § 10.), over whichever of the two
 * routes the platform actually has.
 *
 * INFO: The share sheet is preferred on touch because it is the only way a photo
 * reaches the iOS photo library; the download path saves into Files, where a user
 * who tapped 저장 in a gallery will not look for it.
 *
 * WARN: Pointer-gated on purpose, not only feature-detected. Desktop Chrome answers
 * `canShare` too, and its share sheet offers mail and AirDrop rather than a photo
 * library — there, a plain download is what the tap meant (AGENTS.md § 4.2.).
 */
export function useGallerySave() {
  const isCoarsePointer = useIsCoarsePointer();
  const [progress, setProgress] = useState<Nullable<GallerySaveProgress>>(null);
  // INFO: Set only when the share was refused for a spent user activation — the files are in hand and all that is missing is a tap to spend on them.
  const [blockedFiles, setBlockedFiles] = useState<Nullable<File[]>>(null);

  const save = useCallback(
    async (ids: string[]) => {
      if (!isCoarsePointer || !canShareFiles()) {
        download(ids);

        return;
      }

      if (!isShareableSelection(ids)) {
        toast.error(`사진 앱에는 한 번에 ${MAX_GALLERY_SHARE_FILES}장까지 저장할 수 있어요`);
        download(ids);

        return;
      }

      setProgress({ preparedCount: 0, totalCount: ids.length });

      try {
        const files = await collectShareFiles(ids, (preparedCount) =>
          setProgress({ preparedCount, totalCount: ids.length }),
        );

        if ((await shareFiles(files)) === "blocked") {
          setBlockedFiles(files);
        }
      } catch {
        toast.error("사진 앱에 저장하지 못해 파일로 내려받고 있어요");
        download(ids);
      } finally {
        setProgress(null);
      }
    },
    [isCoarsePointer],
  );

  /** WARN: Called straight from a click handler and never awaited before `navigator.share` — awaiting anything first is what put us here. */
  const shareBlocked = useCallback(async () => {
    if (!blockedFiles) {
      return;
    }

    const outcome = await shareFiles(blockedFiles);

    if (outcome === "blocked") {
      toast.error("사진 앱을 열지 못했어요");
    }

    setBlockedFiles(null);
  }, [blockedFiles]);

  const dismissBlocked = useCallback(() => setBlockedFiles(null), []);

  return { progress, blockedCount: blockedFiles?.length ?? 0, save, shareBlocked, dismissBlocked };
}

function download(ids: string[]) {
  void downloadGalleryMedia(ids);
  // INFO: The browser's own download UI is the progress report; this is only what says the taps registered, since the selection bar is gone by now.
  toast.success(`${ids.length}장을 저장하고 있어요`);
}
