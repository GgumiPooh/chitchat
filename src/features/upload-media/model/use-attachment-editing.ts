"use client";

import type { MediaDraft } from "@/entities/media";
import { isVideoMime } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useState } from "react";
import { toMediaDraft } from "./read-draft";

export type AttachmentEditing = {
  /** The photo the crop is open on. */
  cropping: Nullable<MediaDraft>;
  /** The video the trimmer is open on. */
  trimming: Nullable<MediaDraft>;
  /** True while a trimmed file is being decoded back into a draft. */
  isApplying: boolean;
  /** Hand this to `MediaTray`'s `onEdit`; it picks the editor the kind calls for. */
  open: (draft: MediaDraft) => void;
  close: () => void;
  /** Swap in an edited photo. */
  applyCrop: (edited: MediaDraft) => void;
  /** Read a trimmed file back and swap it in under the id it replaces. */
  applyTrim: (source: MediaDraft, file: File) => Promise<void>;
};

/**
 * The two attachment editors, and the one rule that makes swapping their output
 * back in correct.
 *
 * INFO: One control on a tray tile opens whichever editor the kind calls for — a
 * photo crops and filters (REQUIREMENTS.md § 9.), a video trims (§ 12.1.'s trimmer,
 * with no length cap on an attachment).
 *
 * WARN: A trimmed clip is re-read into a full draft, because its poster, dimensions
 * and duration all belong to the new file — but it **keeps the old draft's id**.
 * `useMediaSelection.replace` matches on that id and `toMediaDraft` mints a fresh
 * one, so without this a trim appends a second tile rather than replacing the one
 * being edited. The rule lives here rather than in each screen, because it is a fact
 * about `replace` and the screens had drifted apart before they could learn it.
 */
export function useAttachmentEditing(replace: (draft: MediaDraft) => void): AttachmentEditing {
  const [cropping, setCropping] = useState<Nullable<MediaDraft>>(null);
  const [trimming, setTrimming] = useState<Nullable<MediaDraft>>(null);
  const [isApplying, setIsApplying] = useState(false);

  const open = useCallback((draft: MediaDraft) => {
    if (isVideoMime(draft.mime)) {
      setTrimming(draft);

      return;
    }

    setCropping(draft);
  }, []);

  const close = useCallback(() => {
    setCropping(null);
    setTrimming(null);
  }, []);

  const applyCrop = useCallback(
    (edited: MediaDraft) => {
      replace(edited);
      setCropping(null);
    },
    [replace],
  );

  /**
   * WARN: `isApplying` covers the decode, and the screen must not let a send run
   * during it. `toMediaDraft` on a trimmed clip is a full video decode bounded only
   * by `DECODE_TIMEOUT`, and the trimmer is already gone — so an upload started in
   * that window ships the **untrimmed** original, and the `replace` that lands after
   * it addresses a draft the send has already taken.
   */
  const applyTrim = useCallback(
    async (source: MediaDraft, file: File) => {
      setIsApplying(true);

      try {
        replace({ ...(await toMediaDraft(file)), id: source.id });
        setTrimming(null);
      } catch {
        toast.error("자른 영상을 읽지 못했어요");
      } finally {
        setIsApplying(false);
      }
    },
    [replace],
  );

  return { cropping, trimming, isApplying, open, close, applyCrop, applyTrim };
}
