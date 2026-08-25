"use client";

import { cn, useIsIos } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { Button, ShellOverlay } from "@/shared/ui";
import { Download, Share, Trash2 } from "lucide-react";

export type ArchiveSelectionBarProps = {
  className?: string;
  selectedCount: number;
  /** The Korean counter the running total is said in — 장 for 사진, 개 for 파일. */
  countUnit?: string;
  isBusy: boolean;
  /**
   * Whether 저장 means the iOS photo library, the only reason the two controls
   * merge (REQUIREMENTS.md § 10.). False for 파일 (§ 9.1.), which downloads on
   * every platform, so 저장/공유 still reach different places there.
   */
  savesToPhotoLibrary?: boolean;
  /** REQUIREMENTS.md § 10. 저장 — a download everywhere but iOS, where a photo's route runs through the share sheet instead. */
  onSave: () => void;
  /**
   * REQUIREMENTS.md § 10. 공유; the row is withheld when absent. Omitted by 음성
   * (§ 9.3.) since `extensionForMime` has no answer for `audio/mp4`.
   */
  onShare?: () => void;
  onDelete: () => void;
};

/**
 * The 저장 / 공유 / 삭제 bar of REQUIREMENTS.md § 10., in the floating-surface
 * language of DESIGN.md § 3.5. On iOS the first two collapse into one row. Portalled
 * into the shell, not left in the screen — it must sit over the tab bar, a sibling of
 * this screen, and an `absolute` strip left in a shelf would ride to the bottom of
 * every month ever loaded (DESIGN.md § 3.3.).
 */
export function ArchiveSelectionBar({
  className,
  selectedCount,
  countUnit = "장",
  isBusy,
  savesToPhotoLibrary = true,
  onSave,
  onShare,
  onDelete,
}: ArchiveSelectionBarProps) {
  // INFO: REQUIREMENTS.md § 10. iOS, not touch — an Android download lands in the library and an iPad with a trackpad still cannot get one there.
  const isIosDevice = useIsIos();
  const isMerged = isIosDevice && savesToPhotoLibrary;
  const isDisabled = selectedCount === 0 || isBusy;
  // INFO: REQUIREMENTS.md § 10. All three reach off the device — two for bytes § 16. never caches, one for the row itself.
  const saveGate = useOfflineGate(isMerged ? OFFLINE_MESSAGES.share : OFFLINE_MESSAGES.save);
  const shareGate = useOfflineGate(OFFLINE_MESSAGES.share);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);

  return (
    <ShellOverlay>
      <div
        className={cn(
          // INFO: DESIGN.md § 3.5. `--bar-lift`, the same clearance `BottomOverlay` holds the tab bar at — this bar stands in its place, so the two cannot be allowed to drift apart.
          // INFO: AGENTS.md § 4.1. `lg:left-(--pane-width)` centres the bar in the main pane rather than under `ShellOverlay`'s full panel+main span — `ShellOverlay` already excludes the rail, so the pane is what is left to exclude.
          "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-md pb-(--bar-lift) motion-reduce:transition-none lg:left-(--pane-width) lg:transition-[left] lg:duration-(--duration-route-enter) lg:ease-route",
          className,
        )}
      >
        <div className="pointer-events-auto flex items-stretch gap-2xs rounded-full border border-hairline glass p-2xs shadow-floating">
          {/* WARN: The count lives here, not only in the header title, which fades out once content scrolls under it (DESIGN.md § 7.12.) — this bar's surface never leaves. */}
          <span className="flex min-h-11 shrink-0 items-center pl-md text-button-md text-meta tabular-nums">
            {selectedCount}
            {countUnit}
          </span>
          {/* WARN: REQUIREMENTS.md § 10. When 저장 is the iOS photo library, this row and the next take the identical route, so only this one renders — 저장 is what the tap is for, 공유 the sheet it arrives through. */}
          <Button
            // WARN: `flex-1 w-auto` overrides `Button`'s own `w-full shrink-0` — two full-width buttons in a row would push the second off the edge.
            className="w-auto flex-1"
            buttonClassName="min-h-11 rounded-full aria-disabled:opacity-50"
            variant="ghost"
            disabled={isDisabled}
            haptic
            {...saveGate.blockedProps}
            onClick={saveGate.guard(onSave)}
          >
            <Download className="size-4" strokeWidth={1.75} />
            {isMerged ? "저장/공유" : "저장"}
          </Button>
          {!isMerged && onShare && (
            <Button
              className="w-auto flex-1"
              buttonClassName="min-h-11 rounded-full aria-disabled:opacity-50"
              variant="ghost"
              disabled={isDisabled}
              haptic
              {...shareGate.blockedProps}
              onClick={shareGate.guard(onShare)}
            >
              <Share className="size-4" strokeWidth={1.75} />
              공유
            </Button>
          )}
          {/* INFO: DESIGN.md § 7.5. A destructive action in a list of choices is the label in `semantic-error`, not a filled red button — the bar is a surface of equals, not a confirmation. */}
          <Button
            className="w-auto flex-1"
            buttonClassName="min-h-11 rounded-full text-semantic-error aria-disabled:opacity-50"
            variant="ghost"
            disabled={isDisabled}
            haptic
            {...deleteGate.blockedProps}
            onClick={deleteGate.guard(onDelete)}
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            삭제
          </Button>
        </div>
      </div>
    </ShellOverlay>
  );
}
