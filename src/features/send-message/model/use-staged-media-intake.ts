"use client";

import { toStagedDraft, type MediaDraft } from "@/entities/media";
import { MAX_MEDIA_PER_MESSAGE } from "@/shared/config";
import { toast } from "@/shared/ui";
import { useEffect } from "react";
import { takeStagedArchiveMedia } from "./staged-archive-media";

/**
 * REQUIREMENTS.md § 10. 채팅으로 보내기 — runs once on mount, staging whatever
 * 보관함 handed off through `stageArchiveMedia` into the composer's own tray, up to
 * its per-message cap; the rest is dropped silently past the cap toast.
 */
export function useStagedMediaIntake(draftCount: number, addDraft: (draft: MediaDraft) => void) {
  useEffect(() => {
    const items = takeStagedArchiveMedia();

    if (items.length === 0) {
      return;
    }

    const room = Math.max(MAX_MEDIA_PER_MESSAGE - draftCount, 0);

    items.slice(0, room).forEach((media) => addDraft(toStagedDraft(media)));

    if (items.length > room) {
      toast.error(`한 번에 ${MAX_MEDIA_PER_MESSAGE}개까지 보낼 수 있어요`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- WARN: Mount-only. The staged list is consumed exactly once; re-running on `draftCount` or `addDraft` changing identity would restage nothing (the store is already empty) but could re-toast.
  }, []);
}
