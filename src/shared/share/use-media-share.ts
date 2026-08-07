"use client";

import { MAX_ARCHIVE_SHARE_FILES } from "@/shared/config";
import { isIos, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useCallback, useState } from "react";
import { downloadMedia } from "./download-files";
import {
  canShareFiles,
  collectShareFiles,
  isShareableSelection,
  shareFiles,
  toShareCapMessage,
} from "./share-files";

/** Which control the files were asked for from — the two differ in wording and in when the sheet is used. */
export type MediaShareIntent = "save" | "share";

export type MediaShareOptions = {
  /**
   * REQUIREMENTS.md § 9.1. id → the name a file attachment is stored under, for a
   * selection R2 cannot name on its own.
   *
   * WARN: Required for the 파일 segment of § 10. and meaningless for 사진, whose
   * name is derived from the mime. Omitted on a file selection, the OS is handed
   * `{uuid}.bin`.
   */
  names?: Record<string, string>;
  /** The Korean counter every sentence below is said in — 장 for 사진, 개 for 파일. */
  countUnit?: string;
};

export type MediaShareProgress = {
  preparedCount: number;
  totalCount: number;
};

/**
 * Handing stored originals to the OS, over whichever of the two routes the platform
 * actually has: `save` is the library's 저장 (REQUIREMENTS.md § 10.), `share` is the
 * 공유 of a chat message (§ 8.11.).
 *
 * INFO: The share sheet is the only way a photo reaches the iOS photo library; the
 * download path saves into Files, where a user who tapped 저장 in a library will not
 * look for it.
 *
 * WARN: 저장 takes the sheet on iOS alone, and 공유 takes it wherever there is one.
 * Everywhere else a download is what 저장 meant: desktop Chrome answers `canShare` but
 * offers mail and AirDrop, and Android indexes the Downloads folder into the library,
 * so on both the sheet is the worse answer to 저장 and the right answer to 공유.
 */
export function useMediaShare() {
  const [progress, setProgress] = useState<Nullable<MediaShareProgress>>(null);
  // INFO: Set only when the share was refused for a spent user activation — the files are in hand and all that is missing is a tap to spend on them.
  const [blocked, setBlocked] =
    useState<Nullable<{ files: File[]; intent: MediaShareIntent }>>(null);

  const run = useCallback(
    async (
      ids: string[],
      intent: MediaShareIntent,
      { names, countUnit = "장" }: MediaShareOptions,
    ) => {
      if (!canShareFiles() || (intent === "save" && !isIos())) {
        download(ids, intent, countUnit);

        return;
      }

      if (!isShareableSelection(ids)) {
        toast.error(
          intent === "save"
            ? `사진 앱에는 한 번에 ${MAX_ARCHIVE_SHARE_FILES}${countUnit}까지 저장할 수 있어요`
            : toShareCapMessage(countUnit),
        );
        download(ids, intent, countUnit);

        return;
      }

      setProgress({ preparedCount: 0, totalCount: ids.length });

      try {
        // WARN: REQUIREMENTS.md § 9.1. `names` is what keeps a file attachment's own name on the `File` handed to the sheet; without it the mime decides, and a file's mime has no extension to decide with.
        const files = await collectShareFiles(
          ids,
          (preparedCount) => setProgress({ preparedCount, totalCount: ids.length }),
          names,
        );

        if ((await shareFiles(files)) === "blocked") {
          setBlocked({ files, intent });
        }
      } catch {
        toast.error(
          intent === "save"
            ? "사진 앱에 저장하지 못해 파일로 내려받고 있어요"
            : "공유하지 못해 내려받고 있어요",
        );
        download(ids, intent, countUnit);
      } finally {
        setProgress(null);
      }
    },
    [],
  );

  // INFO: 저장 is the 사진 route only (REQUIREMENTS.md § 9.1.) — a file downloads on every platform and never reaches the sheet through this.
  const save = useCallback(
    (ids: string[], options: MediaShareOptions = {}) => run(ids, "save", options),
    [run],
  );
  const share = useCallback(
    (ids: string[], options: MediaShareOptions = {}) => run(ids, "share", options),
    [run],
  );

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
function download(ids: string[], intent: MediaShareIntent, countUnit: string) {
  // INFO: The particle follows the counter — `3장을` but `3개를`, so it cannot be part of the sentence. `josa` decides it (AGENTS.md § 0.4.).
  const counted = josa(`${ids.length}${countUnit}`, "을/를");

  void downloadMedia(ids);
  toast.success(
    intent === "save" ? `${counted} 저장하고 있어요` : `공유할 수 없어 ${counted} 내려받고 있어요`,
  );
}
