"use client";

import type { MediaDraft } from "@/entities/media";
import { isAllowedMediaMime } from "@/shared/config";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { toMediaDraft, toStoredMime, validateFile } from "./read-draft";
import { revokePreview } from "./revoke-preview";

export type UseMediaSelectionParams = {
  /**
   * Whether a § 9.1. file attachment may be staged. The composer says yes; the
   * library says no.
   *
   * WARN: Off by default, and the 갤러리 shelf depends on that. `validateFile` admits
   * anything shaped like a mime now, so a `.zip` would stage a tile that grid can never
   * show.
   */
  acceptsFiles?: boolean;
};

/**
 * The attachments staged above the composer. Selection is unlimited
 * (REQUIREMENTS.md § 18. #10) — the split into bubbles happens at send time, not
 * here, so the tray shows exactly what the user picked.
 */
export function useMediaSelection({ acceptsFiles = false }: UseMediaSelectionParams = {}) {
  const [drafts, setDrafts] = useState<MediaDraft[]>([]);
  // WARN: A count and not a flag, because the tray draws one placeholder per file still waiting — a boolean drew a single tile however many were picked, which read as "one photo is loading" for a pick of nine.
  const [pendingCount, setPendingCount] = useState(0);
  const draftsRef = useRef<MediaDraft[]>([]);

  // INFO: The ref mirrors the state so the callbacks below read the current list without depending on it, the same shape `useSendMessage` uses for its pending queue.
  const commit = useCallback((update: (previous: MediaDraft[]) => MediaDraft[]) => {
    draftsRef.current = update(draftsRef.current);
    setDrafts(draftsRef.current);
  }, []);

  // WARN: Revokes whatever the tray still holds. `takeAll` empties this first on a send, so a sent attachment's preview survives into the optimistic bubble.
  useEffect(() => {
    return () => draftsRef.current.forEach(revokePreview);
  }, []);

  const add = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      // INFO: Additive, so a drop landing while an earlier pick is still decoding counts both rather than replacing the first.
      setPendingCount((previous) => previous + files.length);

      const rejections = new Set<string>();

      for (const file of files) {
        // WARN: One `finally` around the whole iteration, validation included — a decrement that only covers the decode leaves a placeholder on screen forever if `toStoredMime` is what threw.
        try {
          // WARN: `toStoredMime`, never a raw `file.type`. An empty type is routine, and everything downstream resolves it to `FALLBACK_FILE_MIME` — reading it raw here let the same typeless JPEG stage as a file card in the composer and be refused outright in the library.
          const rejection =
            acceptsFiles || isAllowedMediaMime(toStoredMime(file))
              ? validateFile(file)
              : "사진과 동영상만 올릴 수 있어요";

          if (rejection) {
            rejections.add(rejection);
            continue;
          }

          // INFO: Committed as each one decodes rather than in a batch at the end, so a placeholder turns into its own tile instead of nine appearing at once.
          const draft = await toMediaDraft(file);

          commit((previous) => [...previous, draft]);
        } catch {
          rejections.add("파일을 읽지 못했어요");
        } finally {
          setPendingCount((previous) => previous - 1);
        }
      }

      // INFO: One toast per distinct reason, not per file — picking forty photos with three oversized ones must not stack forty banners.
      rejections.forEach((rejection) => toast.error(rejection));
    },
    [acceptsFiles, commit],
  );

  /**
   * Stages a draft that was never a picked `File` — REQUIREMENTS.md § 9.3.'s
   * recording, which arrives already decoded with its peaks and its wall-clock
   * duration attached.
   *
   * WARN: It bypasses `validateFile` deliberately, and that is safe only because the
   * recorder is the sole caller: the bytes came from `MediaRecorder` under
   * `MAX_VOICE_DURATION`, and `toVoiceDraft` has already filled in everything
   * `toMediaDraft` would have had to decode. Do not widen this to arbitrary input.
   */
  const addDraft = useCallback(
    (draft: MediaDraft) => {
      commit((previous) => [...previous, draft]);
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      commit((previous) => {
        const dropped = previous.find((draft) => draft.id === id);

        if (dropped) {
          revokePreview(dropped);
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

          revokePreview(draft);

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
      previous.forEach(revokePreview);

      return [];
    });
  }, [commit]);

  return {
    drafts,
    pendingCount,
    isReading: pendingCount > 0,
    add,
    addDraft,
    remove,
    replace,
    takeAll,
    clear,
  };
}
