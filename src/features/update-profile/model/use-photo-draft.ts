"use client";

import type { MediaDraft } from "@/entities/media";
import { toMediaDraft, validateFile } from "@/features/upload-media/@x/update-profile";
import { isImageMime } from "@/shared/config";
import type { Maybe, Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * One photo staged in the browser — the avatar (REQUIREMENTS.md § 12.) or the
 * profile cover (§ 12.1.), one instance each. Nothing reaches R2 until the form is
 * submitted, so abandoning the sheet leaves no object behind — the same rule
 * § 13.4. authors emoticons under.
 *
 * INFO: Reading a file and staging it are two steps, because the crop between them
 * is not optional for the avatar: a photo the user backs out of the editor on was
 * never chosen. The cover stages what it read, since its crop is offered rather
 * than required.
 */
export function usePhotoDraft() {
  const [staged, setStaged] = useState<Nullable<MediaDraft>>(null);
  // INFO: Only the editor can tell these apart: no staged photo means "keep the current one", this means "go back to the initial-letter fallback" (DESIGN.md § 7.7.).
  const [isCleared, setIsCleared] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const urlsRef = useRef(new Set<string>());

  // WARN: Every object URL this hook mints is tracked, including one whose crop was abandoned — a preview outlives the state that referenced it, and nothing else knows the URL exists.
  useEffect(() => {
    const urls = urlsRef.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const read = useCallback(async (file: File): Promise<Nullable<MediaDraft>> => {
    // WARN: The picker's `accept` is advisory — a desktop file dialog hands over whatever the user types the name of, and a video reaching `toMediaDraft` would stage its poster frame as a profile photo.
    if (!isImageMime(file.type)) {
      toast.error("사진만 올릴 수 있어요");

      return null;
    }

    const rejection = validateFile(file);

    if (rejection) {
      toast.error(rejection);

      return null;
    }

    setIsReading(true);

    try {
      const draft = await toMediaDraft(file);

      urlsRef.current.add(draft.previewUrl);

      return draft;
    } catch {
      toast.error("사진을 읽지 못했어요");

      return null;
    } finally {
      setIsReading(false);
    }
  }, []);

  const stage = useCallback((draft: MediaDraft) => {
    urlsRef.current.add(draft.previewUrl);
    setIsCleared(false);
    setStaged((previous) => {
      release(urlsRef.current, previous?.previewUrl);

      return draft;
    });
  }, []);

  const clear = useCallback(() => {
    setIsCleared(true);
    setStaged((previous) => {
      release(urlsRef.current, previous?.previewUrl);

      return null;
    });
  }, []);

  const reset = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setStaged(null);
    setIsCleared(false);
  }, []);

  return { staged, isCleared, isReading, read, stage, clear, reset };
}

function release(urls: Set<string>, url: Maybe<string>) {
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }
}
