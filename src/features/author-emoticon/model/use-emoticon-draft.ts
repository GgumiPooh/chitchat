"use client";

import type { MediaDraft } from "@/entities/media";
import {
  optimizeAudio,
  releasePreview,
  retainPreview,
  toEmoticonImageDrafts,
  type EmoticonImageDrafts,
} from "@/features/upload-media/@x/author-emoticon";
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
 * The slots of one emoticon, staged in the browser. Nothing reaches R2 until the
 * form is submitted (§ 13.4.), so abandoning it leaves no objects behind.
 *
 * INFO: One image state and not two. A picked file answers both slots at once, so a slot can never hold a rendering of a picture the other slot is not showing.
 */
export function useEmoticonDraft() {
  const [image, setImage] = useState<Nullable<EmoticonImageDrafts>>(null);
  const [audio, setAudio] = useState<Nullable<CompanionDraft>>(null);
  // WARN: REQUIREMENTS.md § 13.8. Held as the whole list rather than as a diff, and seeded by the sheet on open — the item being edited already has keywords, and this is the only slot where "unchanged" is a value rather than an absence.
  const [keywords, setKeywords] = useState<string[]>([]);
  // INFO: REQUIREMENTS.md § 13.4. Only the edit flow can tell these apart: no draft means "keep whatever the item has", this means "take the sound away". There is no image counterpart — `emoticon_items_has_image_check` leaves replacing as the only operation.
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

  // INFO: REQUIREMENTS.md § 9.1. Both take a `Maybe` because `MediaDraft.previewUrl` is nullable for a chat file attachment; an emoticon image always has one.
  const track = useCallback((url: Maybe<string>) => retainPreview(urlsRef.current, url), []);
  const release = useCallback((url: Maybe<string>) => releasePreview(urlsRef.current, url), []);

  /** INFO: § 13.4.1. Takes slots that were built elsewhere — a video's, which must not be re-read as a picked file since that would re-encode the animation a second time. */
  const adoptImage = useCallback(
    (upload: EmoticonImageDrafts) => {
      if (!validateUpload(upload)) {
        release(upload.still.previewUrl);
        release(upload.animated?.previewUrl);

        return;
      }

      track(upload.still.previewUrl);
      track(upload.animated?.previewUrl);
      setImage((previous) => {
        release(previous?.still.previewUrl);
        release(previous?.animated?.previewUrl);

        return upload;
      });
    },
    [release, track],
  );

  const pickImage = useCallback(
    async (file: File) => {
      setIsReading(true);

      try {
        adoptImage(await toEmoticonImageDrafts(file));
      } catch {
        toast.error("이미지를 읽지 못했어요");
      } finally {
        setIsReading(false);
      }
    },
    [adoptImage],
  );

  /** INFO: Replaces the still after `MediaEditor` re-encodes it; the editor already produced the new preview. Only a static pick is croppable — a crop decodes one frame (§ 13.4.). */
  const replaceStill = useCallback(
    (still: MediaDraft) => {
      track(still.previewUrl);
      setImage((previous) => {
        release(previous?.still.previewUrl);

        return previous ? { ...previous, still } : { still, animated: null };
      });
    },
    [release, track],
  );

  // INFO: `validateSlot` runs on the pick as-received, before optimizing (§ 14.) — a file over the cap must be rejected rather than silently shrunk under it.
  const pickAudio = useCallback(
    async (file: File) => {
      if (!validateSlot("audio", file)) {
        return;
      }

      setIsReading(true);

      try {
        const { file: optimized } = await optimizeAudio(file);
        const draft = { file: optimized, previewUrl: URL.createObjectURL(optimized) };

        track(draft.previewUrl);

        setIsAudioCleared(false);
        setAudio((previous) => {
          release(previous?.previewUrl);

          return draft;
        });
      } finally {
        setIsReading(false);
      }
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
    setKeywords([]);
  }, []);

  return {
    image,
    audio,
    keywords,
    isAudioCleared,
    isReading,
    adoptImage,
    pickImage,
    replaceStill,
    pickAudio,
    clearAudio,
    setKeywords,
    reset,
  };
}

/** INFO: Both renderings are checked, because both are uploaded — the animation as the bytes that were picked, the still as what the canvas made of them. */
function validateUpload({ still, animated }: EmoticonImageDrafts): boolean {
  return (
    validateSlot("still-image", still.file) &&
    (!animated || validateSlot("animated-image", animated.file))
  );
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
