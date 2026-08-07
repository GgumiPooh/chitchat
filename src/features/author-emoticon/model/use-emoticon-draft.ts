"use client";

import type { MediaDraft } from "@/entities/media";
import { toEmoticonImageDraft } from "@/features/upload-media/@x/author-emoticon";
import {
  allowedMimesForEmoticonSlot,
  maxSizeForEmoticonSlot,
  type EmoticonSlot,
} from "@/shared/config";
import { formatSize, type Maybe, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/** An audio companion the user has picked but not yet uploaded (REQUIREMENTS.md § 13.2.). */
export type CompanionDraft = {
  file: File;
  previewUrl: string;
};

/**
 * The two slots of one emoticon, staged in the browser. Nothing reaches R2 until
 * the form is submitted (§ 13.4.), so abandoning it leaves no objects behind.
 */
export function useEmoticonDraft() {
  const [image, setImage] = useState<Nullable<MediaDraft>>(null);
  const [audio, setAudio] = useState<Nullable<CompanionDraft>>(null);
  // INFO: REQUIREMENTS.md § 13.4. Only the edit flow can tell these apart: no draft means "keep whatever the item has", this means "take the sound away".
  const [isAudioCleared, setIsAudioCleared] = useState(false);
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

  // INFO: REQUIREMENTS.md § 9.1. Takes a `Maybe` because `MediaDraft.previewUrl` is nullable for a chat file attachment; an emoticon image always has one.
  const track = useCallback((url: Maybe<string>) => {
    if (url) {
      urlsRef.current.add(url);
    }

    return url;
  }, []);

  const release = useCallback((url: Maybe<string>) => {
    if (url) {
      URL.revokeObjectURL(url);
      urlsRef.current.delete(url);
    }
  }, []);

  const pickImage = useCallback(
    async (file: File) => {
      setIsReading(true);

      try {
        const draft = await toEmoticonImageDraft(file);

        if (!validateSlot("image", draft.file)) {
          release(draft.previewUrl);

          return;
        }

        track(draft.previewUrl);
        setImage((previous) => {
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

  /** INFO: Replaces the image after `MediaEditor` re-encodes it; the editor already produced the new preview. */
  const replaceImage = useCallback(
    (draft: MediaDraft) => {
      track(draft.previewUrl);
      setImage((previous) => {
        release(previous?.previewUrl);

        return draft;
      });
    },
    [release, track],
  );

  const pickAudio = useCallback(
    (file: File) => {
      if (!validateSlot("audio", file)) {
        return;
      }

      const draft = { file, previewUrl: URL.createObjectURL(file) };

      track(draft.previewUrl);

      setIsAudioCleared(false);
      setAudio((previous) => {
        release(previous?.previewUrl);

        return draft;
      });
    },
    [release, track],
  );

  const clearAudio = useCallback(() => {
    setIsAudioCleared(true);
    setAudio((previous) => {
      release(previous?.previewUrl);

      return null;
    });
  }, [release]);

  const reset = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
    setImage(null);
    setAudio(null);
    setIsAudioCleared(false);
  }, []);

  return {
    image,
    audio,
    isAudioCleared,
    isReading,
    pickImage,
    replaceImage,
    pickAudio,
    clearAudio,
    reset,
  };
}

/** INFO: REQUIREMENTS.md § 14. A courtesy check; registration re-reads what R2 actually stored (§ 13.3.). */
function validateSlot(slot: EmoticonSlot, file: File): boolean {
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
