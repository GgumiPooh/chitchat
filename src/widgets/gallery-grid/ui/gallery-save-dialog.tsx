"use client";

import type { Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import type { GallerySaveProgress } from "../model/use-gallery-save";

export type GallerySaveDialogProps = {
  className?: string;
  progress: Nullable<GallerySaveProgress>;
  blockedCount: number;
  onShare: () => void;
  onDismiss: () => void;
};

/**
 * The two moments the share route of REQUIREMENTS.md § 10. is visible: while the
 * originals are being buffered, and when the sheet has to be asked for a second time.
 *
 * INFO: The second state is not a design choice. iOS spends the tap's activation on
 * the first `await`, so a selection that took long enough to buffer can only reach
 * the share sheet from a fresh tap — this is that tap.
 */
export function GallerySaveDialog({
  className,
  progress,
  blockedCount,
  onShare,
  onDismiss,
}: GallerySaveDialogProps) {
  if (progress) {
    return (
      <Modal
        className={className}
        isOpen
        hideCloseButton
        header={{
          title: "사진을 준비하고 있어요",
          description: `${progress.preparedCount}/${progress.totalCount}장`,
        }}
        onClose={onDismiss}
      />
    );
  }

  return (
    <Modal
      className={className}
      isOpen={blockedCount > 0}
      header={{
        title: `${blockedCount}장이 준비됐어요`,
        description: "사진 앱에 저장하려면 한 번 더 눌러주세요",
      }}
      onClose={onDismiss}
    >
      <Button haptic onClick={onShare}>
        사진에 저장
      </Button>
    </Modal>
  );
}
