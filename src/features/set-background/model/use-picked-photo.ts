"use client";

import type { MediaDraft } from "@/entities/media";
import { toMediaDraft, validateFile } from "@/features/upload-media/@x/set-background";
import { isImageMime } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The wallpaper being picked, held only long enough to reach the editor
 * (REQUIREMENTS.md § 12.2.).
 *
 * INFO: Simpler than § 12.'s `usePhotoDraft`, and deliberately so. That hook stages
 * a photo against a 저장 button that may never be pressed; here the editor's 완료
 * *is* the submit, so there is nothing to stage and no cleared state to tell from an
 * untouched one — 기본 배경으로 is its own action sheet row.
 */
export function usePickedPhoto() {
  const [cropping, setCropping] = useState<Nullable<MediaDraft>>(null);
  const urlsRef = useRef(new Set<string>());

  // WARN: Every object URL this hook mints is tracked, including one whose crop was abandoned — a preview outlives the state that referenced it, and nothing else knows the URL exists.
  useEffect(() => {
    const urls = urlsRef.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const read = useCallback(async (file: File) => {
    // WARN: The picker's `accept` is advisory — a desktop file dialog hands over whatever the user types the name of, and a video reaching `toMediaDraft` would set its poster frame as the wallpaper.
    if (!isImageMime(file.type)) {
      toast.error("사진만 올릴 수 있어요");

      return;
    }

    const rejection = validateFile(file);

    if (rejection) {
      toast.error(rejection);

      return;
    }

    try {
      const draft = await toMediaDraft(file);

      urlsRef.current.add(draft.previewUrl);
      setCropping(draft);
    } catch {
      toast.error("사진을 읽지 못했어요");
    }
  }, []);

  const cancel = useCallback(() => setCropping(null), []);

  const reset = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setCropping(null);
  }, []);

  return { cropping, read, cancel, reset };
}
