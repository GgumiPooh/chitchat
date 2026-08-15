"use client";

import { toMediaCountUnit, toMediaLabel, type MediaNoun } from "@/shared/config";
import type { MediaId, Nullable } from "@/shared/lib";
import { Button, Modal, toDeletedMediaText, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useState } from "react";
import { deleteArchiveMedia } from "../api/delete-archive-media";

export type ArchiveRemovalParams = {
  /** What this shelf's rows are called in a sentence — 사진 / 파일 / 음성, and what every noun below defaults to. */
  noun: MediaNoun;
  /** Ids that have left the shelf — the caller drops them from its own list and from an open viewer. */
  onRemoved: (ids: MediaId[]) => void;
};

/** One removal's subject: the rows it is for, and how the sentences name them. */
export type ArchiveRemovalRequest = {
  /** @see deleteArchiveMedia — plain strings going out, branded ids coming back. */
  ids: string[];
  /** How the title names the subject — `3장`, `이 동영상`. */
  subject: string;
  /** Overrides the shelf's own noun where a single row is specific enough to name, as the § 7.10. viewer's slide is. */
  noun?: MediaNoun;
};

/**
 * REQUIREMENTS.md § 18. #1. 보관함's 삭제 — the confirmation, and the reconciliation of
 * what the server actually took.
 *
 * The object is destroyed and the bubble it was sent in draws a tombstone (§ 4.3.).
 * Either participant may do it: 보관함 is the shared album, so curating it belongs to
 * both, and what keeps that answerable is that the act never removes a bubble — only the
 * picture inside one.
 *
 * WARN: Shared by all three shelves for the reason `useShelfStaging` is — this is the
 * copy that stands in front of an irreversible act, and three screens spelling it out
 * separately is three chances for one of them to describe it wrongly.
 *
 * INFO: Returns its overlay as a node, exactly as `useShelfStaging` returns `sheet` and `editors` — the modal belongs to this flow rather than to whichever screen started it.
 */
export function useArchiveRemoval({ noun, onRemoved }: ArchiveRemovalParams) {
  /**
   * WARN: The subject outlives its dismissal on purpose. `DialogContent` stays mounted
   * through its 200ms exit (DESIGN.md § 7.4.), so clearing it on close would empty the
   * heading and fade the modal out with no title in it. Openness is `isConfirming`.
   */
  const [pending, setPending] = useState<Nullable<ArchiveRemovalRequest>>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const subject = pending?.subject ?? "";
  const subjectNoun = pending?.noun ?? noun;

  return { ask, isRemoving, overlays: renderOverlays() };

  function ask(request: ArchiveRemovalRequest) {
    setPending(request);
    setIsConfirming(true);
  }

  function renderOverlays() {
    return (
      <Modal
        isOpen={isConfirming}
        header={{
          title: `${josa(subject, "을/를")} 삭제할까요?`,
          // INFO: § 4.3. The tombstone's own words, quoted, so the sentence shows what the reader will be left looking at rather than describing it.
          description: `대화 말풍선에는 '${toDeletedMediaText(subjectNoun)}'만 남아요`,
        }}
        onClose={close}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={close}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isRemoving}
            haptic
            onClick={() => void confirm()}
          >
            삭제
          </Button>
        </div>
      </Modal>
    );
  }

  function close() {
    setIsConfirming(false);
  }

  async function confirm() {
    if (pending === null) {
      return;
    }

    setIsRemoving(true);

    try {
      const { deletedIds } = await deleteArchiveMedia(pending.ids);

      onRemoved(deletedIds);
      close();
      reportRefusals(pending.ids.length, deletedIds.length);
    } catch {
      toast.error(`${josa(toMediaLabel(subjectNoun), "을/를")} 삭제하지 못했어요`);
    } finally {
      setIsRemoving(false);
    }
  }

  /**
   * What the server declined to destroy, said plainly.
   *
   * WARN: § 4.1. Ownership is not among the reasons — `destroyArchiveMedia` is not scoped
   * to `owner_id`. What is left is idempotency (a second device, or a retry after a
   * dropped response, meeting `deleted_at IS NULL`) and a row that has since left the
   * shelf, and neither is worth naming: the reader asked for these tiles to be gone and
   * they are.
   */
  function reportRefusals(askedCount: number, removedCount: number) {
    if (removedCount === askedCount) {
      return;
    }

    if (removedCount === 0) {
      toast.error(`삭제할 수 있는 ${josa(toMediaLabel(subjectNoun), "이/가")} 없어요`);

      return;
    }

    toast.success(`${removedCount}${toMediaCountUnit(subjectNoun)}만 삭제했어요`);
  }
}
