"use client";

import type { MediaDraft } from "@/entities/media";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { toMediaDraft, validateFile } from "./read-draft";

/**
 * The attachments staged above the composer. Selection is unlimited
 * (REQUIREMENTS.md § 18. #10) — the split into bubbles happens at send time, not
 * here, so the tray shows exactly what the user picked.
 */
export function useMediaSelection() {
  const [drafts, setDrafts] = useState<MediaDraft[]>([]);
  const [isReading, setIsReading] = useState(false);
  const draftsRef = useRef<MediaDraft[]>([]);

  // INFO: The ref mirrors the state so the callbacks below read the current list without depending on it, the same shape `useSendMessage` uses for its pending queue.
  const commit = useCallback((update: (previous: MediaDraft[]) => MediaDraft[]) => {
    draftsRef.current = update(draftsRef.current);
    setDrafts(draftsRef.current);
  }, []);

  // WARN: Revokes whatever the tray still holds. `takeAll` empties this first on a send, so a sent attachment's preview survives into the optimistic bubble.
  useEffect(() => {
    return () => draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
  }, []);

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setIsReading(true);

      try {
        const accepted: MediaDraft[] = [];
        const rejections = new Set<string>();

        for (const file of files) {
          const rejection = validateFile(file);

          if (rejection) {
            rejections.add(rejection);
            continue;
          }

          try {
            accepted.push(await toMediaDraft(file));
          } catch {
            rejections.add("파일을 읽지 못했어요");
          }
        }

        commit((previous) => [...previous, ...accepted]);
        // INFO: One toast per distinct reason, not per file — picking forty photos with three oversized ones must not stack forty banners.
        rejections.forEach((rejection) => toast.error(rejection));
      } finally {
        setIsReading(false);
      }
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit((previous) => {
        const dropped = previous.find((draft) => draft.id === id);

        if (dropped) {
          URL.revokeObjectURL(dropped.previewUrl);
        }

        return previous.filter((draft) => draft.id !== id);
      });
    },
    [commit],
  );

  /** Swaps in an edited draft, dropping the preview the old one held. */
  const replace = useCallback(
    (next: MediaDraft) => {
      commit((previous) =>
        previous.map((draft) => {
          if (draft.id !== next.id) {
            return draft;
          }

          URL.revokeObjectURL(draft.previewUrl);

          return next;
        }),
      );
    },
    [commit],
  );

  /**
   * Empties the tray and hands the previews over to the caller.
   *
   * WARN: Deliberately does not revoke. The optimistic bubble renders from these
   * URLs until the server echo replaces it, so revoking here blanks the very
   * message the user just sent.
   */
  const takeAll = useCallback(() => {
    const taken = draftsRef.current;

    commit(() => []);

    return taken;
  }, [commit]);

  const clear = useCallback(() => {
    commit((previous) => {
      previous.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));

      return [];
    });
  }, [commit]);

  return { drafts, isReading, add, remove, replace, takeAll, clear };
}
