"use client";

import { useIsCoarsePointer, type Nullable } from "@/shared/lib";
import { ActionSheet } from "@/shared/ui";
import { Camera, Images } from "lucide-react";
import { useRef, type ChangeEvent } from "react";

// INFO: The wildcard, not the § 14. allow-list — iOS narrows its own picker from this and a long explicit list makes it hide formats it would happily have transcoded. `validateFile` rejects what slips through.
const MEDIA_ACCEPT = "image/*,video/*";

export type MediaPickerSheetProps = {
  className?: string;
  // INFO: REQUIREMENTS.md § 13.4. The emoticon flow narrows this to images; chat takes the default.
  accept?: string;
  isOpen: boolean;
  isMultiple?: boolean;
  onClose: () => void;
  onSelect: (files: File[]) => void;
};

/**
 * The KakaoTalk-style attachment sheet behind the composer's `+`.
 *
 * WARN: `capture` and `multiple` are mutually exclusive — a capture is one shot,
 * and iOS ignores `multiple` on that input. That is why these are two rows and
 * two inputs rather than one control with both attributes.
 */
export function MediaPickerSheet({
  className,
  accept = MEDIA_ACCEPT,
  isOpen,
  isMultiple = true,
  onClose,
  onSelect,
}: MediaPickerSheetProps) {
  const albumRef = useRef<Nullable<HTMLInputElement>>(null);
  const cameraRef = useRef<Nullable<HTMLInputElement>>(null);
  // INFO: AGENTS.md § 4.2. An interaction detail, not a layout branch — the sheet keeps its one mobile layout and only drops a row that cannot do anything here.
  const isCoarsePointer = useIsCoarsePointer();

  return (
    <>
      <ActionSheet
        className={className}
        isOpen={isOpen}
        header={{ title: "첨부", isHidden: true }}
        items={[
          { label: "사진/영상", Icon: Images, onSelect: () => albumRef.current?.click() },
          // WARN: `capture` is honoured only where the OS has a camera app to hand the input to. A desktop browser silently ignores it and opens the same dialog as the row above, so the row is dropped rather than left to lie about what it does.
          ...(isCoarsePointer
            ? [{ label: "카메라", Icon: Camera, onSelect: () => cameraRef.current?.click() }]
            : []),
        ]}
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
      {isCoarsePointer && (
        // INFO: `environment` opens the rear camera. iOS runs its own camera app for this, so no browser camera permission is involved (REQUIREMENTS.md § 12.).
        <input
          ref={cameraRef}
          className="hidden"
          type="file"
          accept={accept}
          capture="environment"
          onChange={handleChange}
        />
      )}
    </>
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    // WARN: Cleared so picking the same file twice still fires `change`; the value survives the selection otherwise and the second pick is silent.
    event.target.value = "";

    if (files.length > 0) {
      onSelect(files);
    }
  }
}
