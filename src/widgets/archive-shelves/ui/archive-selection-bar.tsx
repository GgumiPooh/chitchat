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
   * Whether 저장 means the iOS photo library, which is the only reason the two
   * controls ever merge (REQUIREMENTS.md § 10.).
   *
   * WARN: False for 파일 (§ 9.1.). That selection downloads on every platform, so
   * on iOS 저장 and 공유 still reach different places and merging them would hide a
   * control that works.
   */
  savesToPhotoLibrary?: boolean;
  /** REQUIREMENTS.md § 10. 저장 — a download everywhere but iOS, where a photo's route runs through the share sheet instead. */
  onSave: () => void;
  /**
   * REQUIREMENTS.md § 10. 공유, and the row is withheld when it is absent.
   *
   * WARN: Omitted by 음성 (§ 9.3.), where `extensionForMime` has no answer for
   * `audio/mp4` and the sheet would be handed `{uuid}.bin`. 파일 passes it because
   * § 9.1. names each `File` from `media.filename`, which a recording has not got.
   */
  onShare?: () => void;
  onDelete: () => void;
};

/**
 * The 저장 / 공유 / 삭제 bar of REQUIREMENTS.md § 10., in the floating-surface
 * language of DESIGN.md § 3.5. On iOS the first two collapse into one row, since
 * there is only one route there for either to take.
 *
 * WARN: Portalled into the shell rather than left in the screen. It has to sit over
 * the tab bar, which is a sibling of this screen — and an `absolute` strip left in a
 * shelf would ride to the bottom of every month ever loaded (DESIGN.md § 3.3.).
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
          "pointer-events-none absolute inset-x-0 bottom-0 z-30 px-md pb-(--bar-lift)",
          className,
        )}
      >
        <div className="pointer-events-auto flex items-stretch gap-2xs rounded-full border border-hairline glass p-2xs shadow-floating">
          {/* WARN: The count lives here, not only in the header title. The title fades out once content scrolls under it (DESIGN.md § 7.12.), which would take the selection's only running total with it — this bar has a surface of its own and never leaves. */}
          <span className="flex min-h-11 shrink-0 items-center pl-md text-button-md text-meta tabular-nums">
            {selectedCount}
            {countUnit}
          </span>
          {/* WARN: REQUIREMENTS.md § 10. Where 저장 is the iOS photo library, this row and the next take the identical route, so only one is rendered — and it is this one, because 저장 is what the tap is for and 공유 is the sheet it happens to arrive through. A 파일 selection never merges (§ 9.1.): it downloads on iOS too, so the two still reach different places. */}
          <Button
            // WARN: `flex-1 w-auto` overrides `Button`'s own `w-full shrink-0` — two of those in a row each claim the full bar and the second is pushed off the edge. With `haptic` it is the wrapper that has to carry them, since the wrapper is what this row lays out.
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
