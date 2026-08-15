"use client";

import type { MediaDraft } from "@/entities/media";
import { retainPreview, toMediaDraft, validateFile } from "@/features/upload-media/@x/apply-photo";
import { isImageMime } from "@/shared/config";
import type { MediaId, Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { readOriginalFile } from "../api/read-original";

/**
 * The photo being applied, held only long enough to reach the editor
 * (REQUIREMENTS.md § 12.1., § 12.2.).
 *
 * INFO: Simpler than § 12.'s `usePhotoDraft`, and deliberately so. That hook stages
 * a photo against a 저장 button that may never be pressed; here the editor's 완료
 * *is* the submit, so there is nothing to stage and no cleared state to tell from an
 * untouched one — 기본 배경으로 is its own action sheet row.
 */
export function usePickedPhoto() {
  const [cropping, setCropping] = useState<Nullable<MediaDraft>>(null);
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

    // INFO: The picker sheet has already closed itself by the time the OS hands the file over, so without this a large photo's decode leaves the settings list unchanged for seconds and the tap reads as having missed.
    setIsReading(true);

    try {
      const draft = await toMediaDraft(file);

      retainPreview(urlsRef.current, draft.previewUrl);
      setCropping(draft);
    } catch {
      toast.error("사진을 읽지 못했어요");
    } finally {
      setIsReading(false);
    }
  }, []);

  /**
   * REQUIREMENTS.md § 12.1. The same crop, over an object that is already stored —
   * 사진 사용하기 reaches a photo by id rather than through a file dialog.
   *
   * INFO: No `validateFile` and no mime gate. The bytes came off a row § 14. already
   * verified, and the sheet only offers a row the source kind can be worn in.
   */
  const readStored = useCallback(async (mediaId: MediaId): Promise<Nullable<MediaDraft>> => {
    setIsReading(true);

    try {
      const draft = await toMediaDraft(await readOriginalFile(mediaId));

      retainPreview(urlsRef.current, draft.previewUrl);
      setCropping(draft);

      return draft;
    } catch {
      toast.error("사진을 불러오지 못했어요");

      return null;
    } finally {
      setIsReading(false);
    }
  }, []);

  /**
   * REQUIREMENTS.md § 12.1. A file an overlay produced, read back into a draft.
   *
   * INFO: Re-read rather than patched onto the old draft — the video crop answers a
   * `File`, and its poster, box, duration and hash all belong to the new clip.
   */
  const readCropped = useCallback(async (file: File): Promise<Nullable<MediaDraft>> => {
    try {
      const draft = await toMediaDraft(file);

      retainPreview(urlsRef.current, draft.previewUrl);

      return draft;
    } catch {
      toast.error("영상을 읽지 못했어요");

      return null;
    }
  }, []);

  const cancel = useCallback(() => setCropping(null), []);

  // WARN: The editor's 완료 hands back a *new* draft with a `previewUrl` of its own, which nothing else knows about — untracked it outlives every reset and leaks one thumbnail blob per wallpaper change. `usePhotoDraft.stage` tracks the same URL for the same reason.
  // WARN: Takes the editor down before the upload rather than after it. `MediaEditor` re-enables 완료 the moment `onDone` returns, and `onDone` returns long before the R2 PUT does — left mounted, a second tap uploads a second object and races a second PATCH against the first.
  const commit = useCallback((draft: MediaDraft) => {
    retainPreview(urlsRef.current, draft.previewUrl);
    setCropping(null);
  }, []);

  const reset = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setCropping(null);
  }, []);

  return { cropping, isReading, read, readStored, readCropped, cancel, commit, reset };
}
