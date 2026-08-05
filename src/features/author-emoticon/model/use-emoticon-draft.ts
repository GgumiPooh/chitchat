"use client";

import type { MediaDraft } from "@/entities/media";
import { toEmoticonStillDraft } from "@/features/upload-media/@x/author-emoticon";
import {
  allowedMimesForEmoticonSlot,
  maxSizeForEmoticonSlot,
  type EmoticonSlot,
} from "@/shared/config";
import { formatSize, type Maybe, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/** A companion asset the user has picked but not yet uploaded (REQUIREMENTS.md § 13.2.). */
export type CompanionDraft = {
  file: File;
  previewUrl: string;
};

/**
 * The three slots of one emoticon, staged in the browser. Nothing reaches R2 until
 * the form is submitted (§ 13.4.), so abandoning it leaves no objects behind.
 */
export function useEmoticonDraft() {
  const [still, setStill] = useState<Nullable<MediaDraft>>(null);
  const [animated, setAnimated] = useState<Nullable<CompanionDraft>>(null);
  const [audio, setAudio] = useState<Nullable<CompanionDraft>>(null);
  const [isReading, setIsReading] = useState(false);
  const urlsRef = useRef(new Set<string>());

  // WARN: Every object URL this hook mints is tracked, because the previews outlive the state that referenced them — replacing a slot revokes the old one, and unmounting revokes whatever is left.
  useEffect(() => {
    const urls = urlsRef.current;

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const track = useCallback((url: string) => {
    urlsRef.current.add(url);

    return url;
  }, []);

  const release = useCallback((url: Maybe<string>) => {
    if (url) {
      URL.revokeObjectURL(url);
      urlsRef.current.delete(url);
    }
  }, []);

  const pickStill = useCallback(
    async (file: File) => {
      setIsReading(true);

      try {
        const draft = await toEmoticonStillDraft(file);

        track(draft.previewUrl);
        setStill((previous) => {
          release(previous?.previewUrl);

          return draft;
        });
      } catch {
        toast.error("이미지를 읽지 못했어요");
      } finally {
        setIsReading(false);
      }
    },
    [release, track],
  );

  /** INFO: Replaces the still after `MediaEditor` re-encodes it; the editor already produced the new preview. */
  const replaceStill = useCallback(
    (draft: MediaDraft) => {
      track(draft.previewUrl);
      setStill((previous) => {
        release(previous?.previewUrl);

        return draft;
      });
    },
    [release, track],
  );

  const pickCompanion = useCallback(
    (slot: Exclude<EmoticonSlot, "still">, file: File) => {
      if (!validateCompanion(slot, file)) {
        return;
      }

      const draft = { file, previewUrl: track(URL.createObjectURL(file)) };
      const setter = slot === "animated" ? setAnimated : setAudio;

      setter((previous) => {
        release(previous?.previewUrl);

        return draft;
      });
    },
    [release, track],
  );

  const clearCompanion = useCallback(
    (slot: Exclude<EmoticonSlot, "still">) => {
      const setter = slot === "animated" ? setAnimated : setAudio;

      setter((previous) => {
        release(previous?.previewUrl);

        return null;
      });
    },
    [release],
  );

  const reset = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setStill(null);
    setAnimated(null);
    setAudio(null);
  }, []);

  return {
    still,
    animated,
    audio,
    isReading,
    pickStill,
    replaceStill,
    pickCompanion,
    clearCompanion,
    reset,
  };
}

/** INFO: REQUIREMENTS.md § 14. A courtesy check; registration re-reads what R2 actually stored (§ 13.3.). */
function validateCompanion(slot: Exclude<EmoticonSlot, "still">, file: File): boolean {
  if (!allowedMimesForEmoticonSlot(slot).includes(file.type)) {
    toast.error("지원하지 않는 형식이에요");

    return false;
  }

  if (file.size > maxSizeForEmoticonSlot(slot)) {
    toast.error(`${formatSize(maxSizeForEmoticonSlot(slot))}까지 올릴 수 있어요`);

    return false;
  }

  return true;
}
