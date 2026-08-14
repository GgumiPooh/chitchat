"use client";

import { toMediaCountUnit, toMediaLabel, type MediaNoun } from "@/shared/config";
import type { MediaId, Nullable } from "@/shared/lib";
import { ActionSheet, Button, Modal, toDeletedMediaText, toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { EyeOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteArchiveMedia, type ArchiveRemovalMode } from "../api/delete-archive-media";

export type ArchiveRemovalParams = {
  /** What this shelf's rows are called in a sentence — 사진 / 파일 / 음성, and what every noun below defaults to. */
  noun: MediaNoun;
  /** Ids that have left the shelf, whichever way they left it — the caller drops them from its own list and from an open viewer. */
  onRemoved: (ids: MediaId[]) => void;
};

/** One removal's subject: the rows it is for, and how the sentences name them. */
export type ArchiveRemovalRequest = {
  /** @see deleteArchiveMedia — plain strings going out, branded ids coming back. */
  ids: string[];
  /** How the titles name the subject — `3장`, `이 동영상`. */
  subject: string;
  /** Overrides the shelf's own noun where a single row is specific enough to name, as the § 7.10. viewer's slide is. */
  noun?: MediaNoun;
};

/**
 * RESTRUCTURE.md § 4.1. 보관함's two removals, and the whole of the screen that asks
 * for them — the choice between them, a confirmation for each, and the reconciliation
 * of what the server actually took.
 *
 * The doctrine is that they are **different actions rather than degrees of one**:
 *
 * - 보관함에서 숨기기 leaves the shared shelf. Either participant may do it, and it
 *   never touches the bytes (§ 4.2.) — the other participant would otherwise lose an
 *   original they never agreed to give up.
 * - 완전히 삭제 destroys the object, and the bubble it was sent in draws a tombstone
 *   (§ 4.3.). Only the uploader may, which is § 8.13.'s "sender only" applied to the
 *   object rather than to the message.
 *
 * WARN: Shared by all three shelves for the reason `useShelfStaging` is — the copy is
 * what distinguishes two irreversible actions, and three screens spelling it out
 * separately is three chances for one of them to describe the wrong one.
 *
 * INFO: Returns its overlays as a node, exactly as `useShelfStaging` returns `sheet` and `editors` — the sheet and both modals belong to this flow rather than to whichever screen started it.
 */
export function useArchiveRemoval({ noun, onRemoved }: ArchiveRemovalParams) {
  /**
   * WARN: The subject outlives its dismissal on purpose. `DialogContent` stays mounted
   * through its 200ms exit (DESIGN.md § 7.4.), so clearing it on close would empty the
   * heading and fade the modal out with no title in it. Openness is the two states
   * below, never this.
   */
  const [pending, setPending] = useState<Nullable<ArchiveRemovalRequest>>(null);
  const [isChoosing, setIsChoosing] = useState(false);
  const [confirming, setConfirming] = useState<Nullable<ArchiveRemovalMode>>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const subject = pending?.subject ?? "";
  const subjectNoun = pending?.noun ?? noun;

  return { ask, isRemoving, overlays: renderOverlays() };

  function ask(request: ArchiveRemovalRequest) {
    setPending(request);
    setIsChoosing(true);
  }

  function renderOverlays() {
    return (
      <>
        {/* INFO: CLAUDE.md § 2.4. `ActionSheet`'s flat props API — the two removals are a list of choices, which is what a sheet is for, and neither is the default the other is a variant of. */}
        <ActionSheet
          isOpen={isChoosing}
          header={{
            title: `${josa(subject, "을/를")} 어떻게 지울까요?`,
            description: "보관함에서만 숨길지, 원본까지 지울지 고를 수 있어요",
          }}
          items={[
            {
              label: "보관함에서 숨기기",
              Icon: EyeOff,
              onSelect: () => setConfirming("hide"),
            },
            // INFO: DESIGN.md § 7.5. A destructive choice in a list is its label in `semantic-error`; the filled red button belongs to the confirmation that follows.
            {
              label: "완전히 삭제",
              Icon: Trash2,
              variant: "destructive",
              onSelect: () => setConfirming("delete"),
            },
          ]}
          onClose={() => setIsChoosing(false)}
        />
        {/* WARN: § 4.1. Two confirmations rather than one with a swapped verb. Each says what its own removal does to **the other participant's** view, which is the only thing that distinguishes them and the one thing neither button can say. */}
        <Modal
          isOpen={confirming === "hide"}
          header={{
            title: `${josa(subject, "을/를")} 보관함에서 숨길까요?`,
            description: `보관함에서만 사라져요. 대화에 보낸 ${josa(toMediaLabel(subjectNoun), "은/는")} 말풍선에 그대로 남아요`,
          }}
          onClose={close}
        >
          {renderActions("숨기기")}
        </Modal>
        <Modal
          isOpen={confirming === "delete"}
          header={{
            title: `${josa(subject, "을/를")} 완전히 삭제할까요?`,
            // INFO: § 4.1. The ownership clause is gone with the scoping — either participant may destroy any tile on the shared shelf now, so `내가 올린 …만` would be the sentence promising the wrong thing.
            // WARN: § 4.3. What survives is the half that actually needs saying before the tap: it is irreversible, and it reaches a photo the *other* participant may be the one who sent. Both clauses are the reason this action has a confirmation at all where 숨기기's is a courtesy.
            // INFO: § 4.3. The tombstone's own words, quoted, so the sentence shows what the reader will be left looking at rather than describing it.
            description: `원본이 사라져 되돌릴 수 없어요. 대화 말풍선에는 '${toDeletedMediaText(subjectNoun)}'만 남아요`,
          }}
          onClose={close}
        >
          {renderActions("완전히 삭제")}
        </Modal>
      </>
    );
  }

  // WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal.
  function renderActions(label: string) {
    return (
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
          {label}
        </Button>
      </div>
    );
  }

  function close() {
    setConfirming(null);
  }

  async function confirm() {
    const mode = confirming;

    if (pending === null || mode === null) {
      return;
    }

    setIsRemoving(true);

    try {
      const { hiddenIds, deletedIds } = await deleteArchiveMedia(pending.ids, mode);
      // INFO: § 4.1. Both arrays, always. An id leaves the shelf whichever way it left, and `hide` mode answers with rows in **both** — the server deletes an orphan nothing was rendering rather than hiding it into a bucket forever.
      const removed = [...hiddenIds, ...deletedIds];

      onRemoved(removed);
      close();
      reportRefusals(mode, pending.ids.length, removed.length);
    } catch {
      toast.error(
        `${josa(toMediaLabel(subjectNoun), "을/를")} ${mode === "hide" ? "숨기지" : "삭제하지"} 못했어요`,
      );
    } finally {
      setIsRemoving(false);
    }
  }

  /**
   * RESTRUCTURE.md § 4.1. What the server declined to destroy, said plainly.
   *
   * WARN: Only `delete` can come back short. `hide` is open to either participant, so
   * every id it was given has left the shelf and there is nothing to report — a toast
   * there would be noise on the ordinary path.
   */
  function reportRefusals(mode: ArchiveRemovalMode, askedCount: number, removedCount: number) {
    if (mode === "hide" || removedCount === askedCount) {
      return;
    }

    // WARN: § 4.1. The copy says what is true of **both** ways of taking nothing, and ownership is no longer one of them — `destroyArchiveMedia` stopped being scoped to `owner_id`. What is left is idempotency (a second device, or a retry after a dropped response, meeting `deleted_at IS NULL`) and a row that has since left the shelf, and neither is worth naming: the reader asked for these tiles to be gone and they are.
    if (removedCount === 0) {
      toast.error(`완전히 삭제할 수 있는 ${josa(toMediaLabel(subjectNoun), "이/가")} 없어요`);

      return;
    }

    toast.success(`${removedCount}${toMediaCountUnit(subjectNoun)}만 삭제했어요`);
  }
}
