"use client";

import { openFilePicker, type Nullable } from "@/shared/lib";
import { useRef, type ChangeEvent, type ReactNode } from "react";

// INFO: The wildcard, not the § 14. allow-list — iOS narrows its own picker from this and a long explicit list makes it hide formats it would happily have transcoded. `validateFile` rejects what slips through.
export const MEDIA_ACCEPT = "image/*,video/*";

// INFO: REQUIREMENTS.md § 9.1. Everything, because a file attachment is defined by what the app *cannot* draw — narrowing here would be a second allow-list to keep in step with that one.
export const FILE_ACCEPT = "*/*";

export type UseMediaPickerParams = {
  /** REQUIREMENTS.md § 13.4. An image-only slot narrows this; a general attachment takes the default. */
  accept?: string;
  isMultiple?: boolean;
  onSelect: (files: File[]) => void;
};

export type MediaPicker = {
  /** Opens the OS picker on the caller's own call stack, with the app held awake across it (REQUIREMENTS.md § 8.4.1.). */
  open: () => void;
  /**
   * The hidden input `open` drives.
   *
   * WARN: Render it unconditionally, and outside anything that unmounts — a sheet
   * that closes as the OS panel comes up would take the input with it, and the
   * `change` the user's pick fires would land on nothing.
   */
  input: ReactNode;
};

/**
 * REQUIREMENTS.md § 9.1. One file input, opened straight from a control.
 *
 * INFO: A control that offers a single kind of file has nothing to ask, so it opens
 * the OS picker itself rather than a sheet with one row in it — 보관함's 사진 추가,
 * both 프로필 편집 slots, the wallpaper's 사진 고르기 and § 13.4.'s two image slots.
 * `MediaPickerSheet` is what remains for the places that really do offer a choice.
 */
export function useMediaPicker({
  accept = MEDIA_ACCEPT,
  isMultiple = false,
  onSelect,
}: UseMediaPickerParams): MediaPicker {
  const ref = useRef<Nullable<HTMLInputElement>>(null);

  return {
    open,
    input: (
      <input
        ref={ref}
        className="hidden"
        type="file"
        accept={accept}
        multiple={isMultiple}
        onChange={handleChange}
      />
    ),
  };

  // WARN: REQUIREMENTS.md § 8.4.1. Never a bare `.click()` — nothing else holds 절전 모드 off an OS panel the idle timer cannot see.
  function open() {
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
