"use client";

import { openFilePicker, type Nullable } from "@/shared/lib";
import { ActionSheet, type ActionSheetItem } from "@/shared/ui";
import { FileUp, Images, Mic } from "lucide-react";
import { useRef, type ChangeEvent, type RefObject } from "react";

// INFO: The wildcard, not the § 14. allow-list — iOS narrows its own picker from this and a long explicit list makes it hide formats it would happily have transcoded. `validateFile` rejects what slips through.
const MEDIA_ACCEPT = "image/*,video/*";

// INFO: REQUIREMENTS.md § 9.1. Everything, because a file attachment is defined by what the app *cannot* draw — narrowing here would be a second allow-list to keep in step with that one.
const FILE_ACCEPT = "*/*";

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
  const albumRef = useRef<Nullable<HTMLInputElement>>(null);
  const fileRef = useRef<Nullable<HTMLInputElement>>(null);

  return (
    <>
      <ActionSheet
        className={className}
        isOpen={isOpen}
        header={{ title: "첨부", isHidden: true }}
        items={buildItems()}
        onClose={onClose}
      />
      <input
        ref={albumRef}
        className="hidden"
        type="file"
        accept={accept}
        multiple={isMultiple}
        onChange={handleChange}
      />
      {/* WARN: REQUIREMENTS.md § 9.1. A second input rather than a wider `accept` on the first — an album input that accepts everything costs iOS its photo picker entirely and opens Files, where the camera roll is not what the user came for. */}
      {hasFileRow && (
        <input
          ref={fileRef}
          className="hidden"
          type="file"
          accept={FILE_ACCEPT}
          multiple={isMultiple}
          onChange={handleChange}
        />
      )}
    </>
  );

  function buildItems(): ActionSheetItem[] {
    const items: ActionSheetItem[] = [
      { label: "사진/영상", Icon: Images, onSelect: () => openPicker(albumRef) },
    ];

    if (hasFileRow) {
      items.push({ label: "파일", Icon: FileUp, onSelect: () => openPicker(fileRef) });
    }

    // INFO: REQUIREMENTS.md § 9.3. Last, because the two above open a picker and this one opens the microphone — the odd one out belongs at the end rather than between them.
    if (onRecordVoice) {
      items.push({ label: "음성", Icon: Mic, onSelect: onRecordVoice });
    }

    return items;
  }

  // WARN: REQUIREMENTS.md § 8.4.1. Never a bare `.click()` — the sheet has closed by the time the OS panel is up, so nothing else holds 절전 모드 off the picker.
  function openPicker(ref: RefObject<Nullable<HTMLInputElement>>) {
    if (ref.current) {
      openFilePicker(ref.current);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    // WARN: Cleared so picking the same file twice still fires `change`; the value survives the selection otherwise and the second pick is silent.
    event.target.value = "";

    if (files.length > 0) {
      onSelect(files);
    }
  }
}
