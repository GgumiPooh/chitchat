"use client";

import { readMediaFile, type MediaDraft } from "@/entities/media";
import {
  revokePreview,
  toMediaDraft,
  type AttachmentEditing,
} from "@/features/upload-media/@x/send-message";
import { toMediaDownloadUrl } from "@/shared/config";
import { type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useRef, useState } from "react";

export type AttachmentPromotion = {
  /** REQUIREMENTS.md § 10. The id-backed draft whose original is downloading, for `MediaTray`'s spinner. `null` outside that window. */
  downloadingId: Nullable<string>;
  /** `MediaTray`'s `onEdit` — an ordinary draft opens straight away; an id-backed one downloads its original first and opens the editor on that. */
  requestEdit: (draft: MediaDraft) => void;
  /** The editors' `onCancel` — reverts an unsaved promotion, keeping the id-backed item exactly as it was. */
  cancelEdit: () => void;
  /** `MediaEditor`'s `onDone`. */
  applyCrop: (edited: MediaDraft) => void;
  /** `VideoTrimmer`'s `onDone`. */
  applyTrim: (source: MediaDraft, file: File) => Promise<void>;
};

/**
 * REQUIREMENTS.md § 10. 채팅으로 보내기 — tapping edit on an id-backed tray tile has
 * nothing to crop or trim yet, so this downloads the original into a real draft
 * first. The tray itself is untouched until SAVE: `MediaEditor`/`VideoTrimmer` are
 * opened on the downloaded draft under the *same id* as the tray's own entry, so
 * `useMediaSelection.replace` (behind `editing.applyCrop`/`applyTrim`) swaps the
 * right tile in place on save, and a cancel leaves the tray's id-backed entry
 * exactly as `editing.open` found it.
 */
export function useAttachmentPromotion(
  editing: AttachmentEditing,
  isStaged: (id: string) => boolean,
): AttachmentPromotion {
  const [downloadingId, setDownloadingId] = useState<Nullable<string>>(null);
  // WARN: The downloaded draft's own blobs are never registered with the tray, so nothing but this hook revokes them — `finishPromotion` owns every path that hands the draft to `editing.open` (cancel and both editors' save); `requestEdit` itself revokes a draft that never reaches `editing.open`.
  const promotedRef = useRef<Nullable<MediaDraft>>(null);

  const finishPromotion = useCallback(() => {
    if (promotedRef.current) {
      revokePreview(promotedRef.current);
      promotedRef.current = null;
    }
  }, []);

  const requestEdit = useCallback(
    (draft: MediaDraft) => {
      if (!draft.sourceMediaId) {
        editing.open(draft);
        return;
      }

      const mediaId = draft.sourceMediaId;

      setDownloadingId(draft.id);

      void (async () => {
        let promoted: Nullable<MediaDraft> = null;

        try {
          const file = await readMediaFile(toMediaDownloadUrl(mediaId), mediaId, draft.mime);

          promoted = { ...(await toMediaDraft(file)), id: draft.id };

          // WARN: REQUIREMENTS.md § 10. The download is async, so the tray tile it was opened for may be gone by the time it resolves — opening the editor on it then would edit a draft `useMediaSelection.replace` can never find again.
          if (!isStaged(draft.id)) {
            revokePreview(promoted);

            return;
          }

          promotedRef.current = promoted;
          editing.open(promoted);
        } catch {
          if (promoted) {
            revokePreview(promoted);
          }

          toast.error("원본을 불러오지 못했어요");
        } finally {
          setDownloadingId(null);
        }
      })();
    },
    [editing, isStaged],
  );

  const cancelEdit = useCallback(() => {
    editing.close();
    finishPromotion();
  }, [editing, finishPromotion]);

  const applyCrop = useCallback(
    (edited: MediaDraft) => {
      editing.applyCrop(edited);
      finishPromotion();
    },
    [editing, finishPromotion],
  );

  const applyTrim = useCallback(
    async (source: MediaDraft, file: File) => {
      // WARN: A failed decode leaves `editing`'s trimmer open on the untrimmed source — see `useAttachmentEditing.applyTrim`. Finishing the promotion here would revoke the blob that open trimmer is still pointing at.
      if (await editing.applyTrim(source, file)) {
        finishPromotion();
      }
    },
    [editing, finishPromotion],
  );

  return { downloadingId, requestEdit, cancelEdit, applyCrop, applyTrim };
}
