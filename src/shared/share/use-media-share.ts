"use client";

import { MAX_GALLERY_SHARE_FILES } from "@/shared/config";
import { isIos, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useState } from "react";
import { downloadMedia } from "./download-files";
import {
  canShareFiles,
  collectShareFiles,
  isShareableSelection,
  SHARE_CAP_MESSAGE,
  shareFiles,
} from "./share-files";

/** Which control the files were asked for from — the two differ in wording and in when the sheet is used. */
export type MediaShareIntent = "save" | "share";

export type MediaShareProgress = {
  preparedCount: number;
  totalCount: number;
};

/**
 * Handing stored originals to the OS, over whichever of the two routes the platform
 * actually has: `save` is the gallery's 저장 (REQUIREMENTS.md § 10.), `share` is the
 * 공유 of a chat message (§ 8.11.).
 *
 * INFO: The share sheet is the only way a photo reaches the iOS photo library; the
 * download path saves into Files, where a user who tapped 저장 in a gallery will not
 * look for it.
 *
 * WARN: 저장 takes the sheet on iOS alone, and 공유 takes it wherever there is one.
 * Everywhere else a download is what 저장 meant: desktop Chrome answers `canShare` but
 * offers mail and AirDrop, and Android indexes the Downloads folder into the gallery,
 * so on both the sheet is the worse answer to 저장 and the right answer to 공유.
 */
export function useMediaShare() {
  const [progress, setProgress] = useState<Nullable<MediaShareProgress>>(null);
  // INFO: Set only when the share was refused for a spent user activation — the files are in hand and all that is missing is a tap to spend on them.
  const [blocked, setBlocked] =
    useState<Nullable<{ files: File[]; intent: MediaShareIntent }>>(null);

  const run = useCallback(async (ids: string[], intent: MediaShareIntent) => {
    if (!canShareFiles() || (intent === "save" && !isIos())) {
      download(ids, intent);

      return;
    }

    if (!isShareableSelection(ids)) {
      toast.error(
        intent === "save"
          ? `사진 앱에는 한 번에 ${MAX_GALLERY_SHARE_FILES}장까지 저장할 수 있어요`
          : SHARE_CAP_MESSAGE,
      );
      download(ids, intent);

      return;
    }

    setProgress({ preparedCount: 0, totalCount: ids.length });

    try {
      const files = await collectShareFiles(ids, (preparedCount) =>
        setProgress({ preparedCount, totalCount: ids.length }),
      );

      if ((await shareFiles(files)) === "blocked") {
        setBlocked({ files, intent });
      }
    } catch {
      toast.error(
        intent === "save"
          ? "사진 앱에 저장하지 못해 파일로 내려받고 있어요"
          : "공유하지 못해 파일로 내려받고 있어요",
      );
      download(ids, intent);
    } finally {
      setProgress(null);
    }
  }, []);

  const save = useCallback((ids: string[]) => run(ids, "save"), [run]);
  const share = useCallback((ids: string[]) => run(ids, "share"), [run]);

  /** WARN: Called straight from a click handler and never awaited before `navigator.share` — awaiting anything first is what put us here. */
  const retryBlocked = useCallback(async () => {
    if (!blocked) {
      return;
    }

    if ((await shareFiles(blocked.files)) === "blocked") {
      toast.error(blocked.intent === "save" ? "사진 앱을 열지 못했어요" : "공유하지 못했어요");
    }

    setBlocked(null);
  }, [blocked]);

  const dismissBlocked = useCallback(() => setBlocked(null), []);

  return {
    progress,
    blockedCount: blocked?.files.length ?? 0,
    blockedIntent: blocked?.intent ?? "save",
    save,
    share,
    retryBlocked,
    dismissBlocked,
  };
}

// INFO: The browser's own download UI is the progress report; the toast is only what says the tap registered, since the control that started it is gone by now — and on the 공유 intent it is also the only thing that says the sheet was never an option.
function download(ids: string[], intent: MediaShareIntent) {
  void downloadMedia(ids);
  toast.success(
    intent === "save"
      ? `${ids.length}장을 저장하고 있어요`
      : `공유할 수 없어 ${ids.length}장을 파일로 내려받고 있어요`,
  );
}
