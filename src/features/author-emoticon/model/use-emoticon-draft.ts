"use client";

import type { MediaDraft } from "@/entities/media";
import {
  releasePreview,
  retainPreview,
  toEmoticonImagePick,
} from "@/features/upload-media/@x/author-emoticon";
import {
  allowedMimesForEmoticonSlot,
  maxSizeForEmoticonSlot,
  type EmoticonImageSlot,
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

/** INFO: § 13.4. What a slot's picker refused, so the row that asked can say which of the two the file belongs in. */
const SLOT_MISMATCH: Record<EmoticonImageSlot, string> = {
  "still-image": "움직이는 이미지예요. 움직이는 이미지 칸에 올려주세요",
  "animated-image": "움직이지 않는 이미지예요. 정지 이미지 칸에 올려주세요",
};

/**
 * The slots of one emoticon, staged in the browser. Nothing reaches R2 until the
 * form is submitted (§ 13.4.), so abandoning it leaves no objects behind.
 */
export function useEmoticonDraft() {
  const [still, setStill] = useState<Nullable<MediaDraft>>(null);
  const [animated, setAnimated] = useState<Nullable<MediaDraft>>(null);
  const [audio, setAudio] = useState<Nullable<CompanionDraft>>(null);
  // INFO: § 13.4. The same distinction `isAudioCleared` draws, per image slot: an empty row is "keep what the item has" until the user empties it themselves.
  const [clearedSlots, setClearedSlots] = useState<EmoticonImageSlot[]>([]);
  // WARN: REQUIREMENTS.md § 13.8. Held as the whole list rather than as a diff, and seeded by the sheet on open — the item being edited already has keywords, and this is the only slot where "unchanged" is a value rather than an absence.
  const [keywords, setKeywords] = useState<string[]>([]);
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

  // INFO: REQUIREMENTS.md § 9.1. Both take a `Maybe` because `MediaDraft.previewUrl` is nullable for a chat file attachment; an emoticon image always has one.
  const track = useCallback((url: Maybe<string>) => retainPreview(urlsRef.current, url), []);
  const release = useCallback((url: Maybe<string>) => releasePreview(urlsRef.current, url), []);

  const setSlot = useCallback(
    (slot: EmoticonImageSlot, draft: Nullable<MediaDraft>) => {
      const apply = (previous: Nullable<MediaDraft>) => {
        release(previous?.previewUrl);

        return draft;
      };

      track(draft?.previewUrl);
      (slot === "still-image" ? setStill : setAnimated)(apply);
      setClearedSlots((slots) =>
        draft ? slots.filter((cleared) => cleared !== slot) : [...slots, slot],
      );
    },
    [release, track],
  );

  /**
   * INFO: § 13.4. `slot` is the row the user tapped, and a file that belongs in the
   * other one is refused rather than moved — silently re-filing it would leave the
   * row they tapped still empty with no reason given. Absent, the file goes wherever
   * its own bytes put it, which is what a pick made before the form opened wants.
   */
  const pickImage = useCallback(
    async (file: File, slot?: EmoticonImageSlot) => {
      setIsReading(true);

      try {
        const pick = await toEmoticonImagePick(file);

        if (slot && pick.slot !== slot) {
          release(pick.draft.previewUrl);
          toast.error(SLOT_MISMATCH[slot]);

          return;
        }

        if (!validateSlot(pick.slot, pick.draft.file)) {
          release(pick.draft.previewUrl);

          return;
        }

        setSlot(pick.slot, pick.draft);
      } catch {
        toast.error("이미지를 읽지 못했어요");
      } finally {
        setIsReading(false);
      }
    },
    [release, setSlot],
  );

  /** INFO: Replaces the still after `MediaEditor` re-encodes it; the editor already produced the new preview. Only the still is croppable — a crop decodes one frame (§ 13.4.). */
  const replaceStill = useCallback((draft: MediaDraft) => setSlot("still-image", draft), [setSlot]);

  const clearImage = useCallback((slot: EmoticonImageSlot) => setSlot(slot, null), [setSlot]);

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
    setStill(null);
    setAnimated(null);
    setAudio(null);
    setClearedSlots([]);
    setIsAudioCleared(false);
    setKeywords([]);
  }, []);

  return {
    still,
    animated,
    audio,
    keywords,
    isStillCleared: clearedSlots.includes("still-image"),
    isAnimatedCleared: clearedSlots.includes("animated-image"),
    isAudioCleared,
    isReading,
    pickImage,
    replaceStill,
    clearImage,
    pickAudio,
    clearAudio,
    setKeywords,
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
