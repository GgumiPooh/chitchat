"use client";

import type { MediaDraft } from "@/entities/media";
import { toMediaDraft, validateFile } from "@/features/upload-media/@x/update-profile";
import {
  MAX_BACKGROUND_VIDEO_SIZE,
  isImageMime,
  isVideoMime,
  type MediaUploadScope,
} from "@/shared/config";
import { formatSize, type Maybe, type Nullable } from "@/shared/lib";
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
 *
 * INFO: REQUIREMENTS.md § 12.1. `background` also takes a video, which the avatar
 * slot must not — an avatar is drawn in a circle by an `<img>` everywhere in the
 * app, so a video there has nothing that could play it.
 */
export function usePhotoDraft(scope: MediaUploadScope = "avatar") {
  const canTakeVideo = scope === "background";
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

  const read = useCallback(
    async (file: File): Promise<Nullable<MediaDraft>> => {
      const rejection = rejectFile(file, canTakeVideo);

      if (rejection) {
        toast.error(rejection);

        return null;
      }

      setIsReading(true);

      try {
        const draft = await toMediaDraft(file);

        retain(urlsRef.current, draft.previewUrl);

        return draft;
      } catch {
        toast.error(isVideoMime(file.type) ? "영상을 읽지 못했어요" : "사진을 읽지 못했어요");

        return null;
      } finally {
        setIsReading(false);
      }
    },
    [canTakeVideo],
  );

  const stage = useCallback((draft: MediaDraft) => {
    retain(urlsRef.current, draft.previewUrl);
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

/**
 * The Korean reason this pick cannot be worn, or `null`.
 *
 * WARN: The picker's `accept` is advisory — a desktop file dialog hands over
 * whatever the user types the name of, so a video reaching `toMediaDraft` on the
 * avatar slot would stage its poster frame as a profile photo.
 *
 * WARN: The video size is measured against `MAX_BACKGROUND_VIDEO_SIZE`, not
 * `validateFile`'s `MAX_VIDEO_SIZE` (§ 12.1.). It is checked **before** the trim,
 * which is the wrong end for a source that is about to get shorter — but the trim
 * decodes the whole file, and a 500MB one would be an unbounded wait on a phone for
 * a pick that is going to be refused anyway.
 */
function rejectFile(file: File, canTakeVideo: boolean): Nullable<string> {
  if (isVideoMime(file.type)) {
    if (!canTakeVideo) {
      return "사진만 올릴 수 있어요";
    }

    return file.size > MAX_BACKGROUND_VIDEO_SIZE
      ? `배경 영상은 ${formatSize(MAX_BACKGROUND_VIDEO_SIZE)}까지 쓸 수 있어요`
      : null;
  }

  if (!isImageMime(file.type)) {
    return "지원하지 않는 형식이에요";
  }

  return validateFile(file);
}

// INFO: REQUIREMENTS.md § 9.1. `previewUrl` is nullable because a chat file attachment has none; every draft reaching this hook is an image and always does.
function retain(urls: Set<string>, url: Maybe<string>) {
  if (url) {
    urls.add(url);
  }
}

function release(urls: Set<string>, url: Maybe<string>) {
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(url);
  }
}
