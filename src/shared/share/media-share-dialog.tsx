"use client";

import type { Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import { josa } from "es-hangul";
import type { MediaShareIntent, MediaShareProgress } from "./use-media-share";

export type MediaShareDialogProps = {
  className?: string;
  progress: Nullable<MediaShareProgress>;
  blockedCount: number;
  blockedIntent: MediaShareIntent;
  /** What is being prepared — 사진 for the grid and a chat bubble, 파일 for REQUIREMENTS.md § 10.'s 파일 segment. */
  subject?: string;
  /** The Korean counter that subject is counted in — 장 for 사진, 개 for 파일. */
  countUnit?: string;
  onRetry: () => void;
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
export function MediaShareDialog({
  className,
  progress,
  blockedCount,
  blockedIntent,
  subject = "사진",
  countUnit = "장",
  onRetry,
  onDismiss,
}: MediaShareDialogProps) {
  // INFO: 저장 only ever means the iOS photo library (REQUIREMENTS.md § 9.1.), so its two sentences stay worded for 사진 whatever the subject is.
  const isSaving = blockedIntent === "save";

  if (progress) {
    return (
      <Modal
        className={className}
        isOpen
        hideCloseButton
        header={{
          title: `${josa(subject, "을/를")} 준비하고 있어요`,
          description: `${progress.preparedCount}/${progress.totalCount}${countUnit}`,
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
        // INFO: The particle follows the counter — `3장이` but `3개가` (AGENTS.md § 0.4.).
        title: `${josa(`${blockedCount}${countUnit}`, "이/가")} 준비됐어요`,
        description: isSaving
          ? "사진 앱에 저장하려면 한 번 더 눌러주세요"
          : "공유하려면 한 번 더 눌러주세요",
      }}
      onClose={onDismiss}
    >
      <Button haptic onClick={onRetry}>
        {isSaving ? "사진에 저장" : "공유하기"}
      </Button>
    </Modal>
  );
}
