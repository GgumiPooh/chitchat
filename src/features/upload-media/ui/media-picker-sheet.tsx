"use client";

import { ActionSheet, type ActionSheetItem } from "@/shared/ui";
import { FileUp, Images, Mic } from "lucide-react";
import { FILE_ACCEPT, MEDIA_ACCEPT, useMediaPicker } from "../model/use-media-picker";

export type MediaPickerSheetProps = {
  className?: string;
  // INFO: REQUIREMENTS.md § 13.4. The emoticon flow narrows this to images; chat takes the default.
  accept?: string;
  isOpen: boolean;
  isMultiple?: boolean;
  /** REQUIREMENTS.md § 9.1. Offers 파일 beside 사진/영상. Chat alone sets it — an avatar, a background and an emoticon are all images by definition. */
  hasFileRow?: boolean;
  /**
   * REQUIREMENTS.md § 9.3. Offers 음성, which opens the recorder rather than a file
   * input. Chat alone sets it.
   *
   * WARN: A row here rather than a fourth control in the composer. DESIGN.md § 6.6.
   * fixes that row at attach, field, emoticon toggle and send, and a 44px target
   * added to it is what makes the round buttons oval on an engine without
   * `field-sizing-content`.
   */
  onRecordVoice?: () => void;
  onClose: () => void;
  onSelect: (files: File[]) => void;
};

/**
 * The KakaoTalk-style attachment sheet behind the composer's `+`.
 *
 * WARN: REQUIREMENTS.md § 9.1. Only for a control that genuinely offers a choice —
 * the composer's `+` and 파일's add control are the two left. A slot that takes one
 * kind of file uses `useMediaPicker` and opens the OS picker outright; a sheet with
 * a single row in it is a tap the user has to spend before the tap they meant.
 *
 * INFO: No `카메라` row, deliberately. A `capture` input cannot also be `multiple`,
 * and iOS already offers the camera from inside the picker the album row opens.
 */
export function MediaPickerSheet({
  className,
  accept = MEDIA_ACCEPT,
  isOpen,
  isMultiple = true,
  hasFileRow = false,
  onRecordVoice,
  onClose,
  onSelect,
}: MediaPickerSheetProps) {
  const album = useMediaPicker({ accept, isMultiple, onSelect });
  // WARN: REQUIREMENTS.md § 9.1. A second input rather than a wider `accept` on the first — an album input that accepts everything costs iOS its photo picker entirely and opens Files, where the camera roll is not what the user came for.
  const file = useMediaPicker({ accept: FILE_ACCEPT, isMultiple, onSelect });

  return (
    <>
      <ActionSheet
        className={className}
        isOpen={isOpen}
        header={{ title: "첨부", isHidden: true }}
        items={buildItems()}
        onClose={onClose}
      />
      {album.input}
      {hasFileRow && file.input}
    </>
  );

  function buildItems(): ActionSheetItem[] {
    const items: ActionSheetItem[] = [{ label: "사진/영상", Icon: Images, onSelect: album.open }];

    if (hasFileRow) {
      items.push({ label: "파일", Icon: FileUp, onSelect: file.open });
    }

    // INFO: REQUIREMENTS.md § 9.3. Last, because the two above open a picker and this one opens the microphone — the odd one out belongs at the end rather than between them.
    if (onRecordVoice) {
      items.push({ label: "음성", Icon: Mic, onSelect: onRecordVoice });
    }

    return items;
  }
}
