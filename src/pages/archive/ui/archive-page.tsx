"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useSetBackground } from "@/features/set-background";
import { MediaPickerSheet } from "@/features/upload-media";
import { CHAT_MESSAGE_PARAM, CHAT_ROUTE } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import {
  downloadMedia,
  isShareableSelection,
  MediaShareDialog,
  toShareCapMessage,
  useMediaShare,
} from "@/shared/share";
import {
  AppHeader,
  Button,
  EmptyState,
  IconButton,
  MediaViewer,
  Modal,
  toast,
  type MediaCell,
} from "@/shared/ui";
import {
  ArchiveGrid,
  ArchiveSelectionBar,
  deleteArchiveMedia,
  useArchiveMedia,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { josa } from "es-hangul";
import { ImagePlus, Images, ListChecks, MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LibrarySegments } from "./library-segments";

export type ArchivePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
  /** REQUIREMENTS.md § 10. The photo 채팅's viewer sent the reader here to see, from `?target=`; the window above already came back centred on it. */
  targetId?: string;
};

/**
 * REQUIREMENTS.md § 10. 보관함's 사진 segment — everything the conversation has ever
 * exchanged, newest first. `media` is the single source, so nothing here is a copy
 * of a chat row.
 */
export function ArchivePage({ className, initialMedia, targetId }: ArchivePageProps) {
  const router = useRouter();
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  // INFO: What one confirmation answers for — the whole selection, or the single slide the viewer's 삭제 was tapped on. The two reach the same endpoint and differ only in the nouns their sentences take.
  // WARN: Openness is the boolean beside it and never this, which outlives a dismissal on purpose. `DialogContent` stays mounted through its 200ms exit (`DESIGN.md § 7.4.`), so clearing the subject on close empties the heading and the modal fades out with no title in it.
  const [pendingDelete, setPendingDelete] = useState<Nullable<PendingDelete>>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const {
    media,
    isLoadingMore,
    isLoadingNewer,
    hasHeldNewer,
    loadMore,
    loadNewer,
    insertNewer,
    prepend,
    remove,
  } = useArchiveMedia(initialMedia, "photo", targetId);
  const selection = useArchiveSelection();
  const setBackground = useSetBackground();
  const saving = useMediaShare();
  // INFO: REQUIREMENTS.md § 9.2. Blocked while a selection is up — a drop would upload into the grid the bar is about to delete from, which is the very window § 10. closes by withholding selection during an upload. The viewer is the other cover; the editors are the hook's own business.
  // INFO: § 9.1. `acceptsFiles: false`, and this is the one shelf that says so. The grid draws thumbnails and a `.zip` has none, so a file dropped here is refused with copy the user can act on rather than quietly filed onto another shelf.
  const staging = useShelfStaging({
    kind: "photo",
    acceptsFiles: false,
    isBlocked: selection.isSelecting || viewer !== null,
    onAdded: prepend,
  });
  const selectedCount = selection.selectedIds.length;

  return (
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole screen, so photos dragged anywhere over the grid stage rather than having to find the 사진 추가 control.
    <div className={cn("flex flex-1 flex-col", className)} {...staging.dropHandlers}>
      <AppHeader
        // INFO: 보관함 on every segment, matching the tab label — the chips below say which shelf, so the title has no reason to repeat it.
        title={selection.isSelecting ? `${selectedCount}장 선택` : "보관함"}
        // INFO: DESIGN.md § 7.12. Every header control is an `icon-button-floating` — the header itself has no surface, so a bare text button would sit on whatever tile scrolled under it.
        trailing={
          selection.isSelecting ? (
            <IconButton
              variant="floating"
              Icon={X}
              aria-label="선택 취소"
              onClick={selection.cancel}
            />
          ) : (
            <>
              <IconButton
                variant="floating"
                Icon={ImagePlus}
                haptic
                aria-label="사진 추가"
                onClick={() => setIsPickerOpen(true)}
              />
              {/* WARN: Unavailable while an upload is in flight. A photo being posted is in the grid with no message attached yet, which is exactly what `removeArchiveMedia` reads as "delete it outright" — deleting it there would take the row out from under the `postMessage` that was about to reference it. */}
              <IconButton
                variant="floating"
                Icon={ListChecks}
                disabled={media.length === 0 || staging.isUploading}
                haptic
                aria-label="선택"
                onClick={() => selection.start()}
              />
            </>
          )
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]">
        {/* INFO: REQUIREMENTS.md § 10. Withheld in selection mode, as the header's own controls are — a segment tap there is a navigation that would drop the selection with nothing having said so. */}
        {!selection.isSelecting && <LibrarySegments className="pb-sm" />}
        {media.length === 0 && staging.remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={Images} description="아직 주고받은 사진이 없어요" />
          </div>
        ) : (
          <div className="space-y-sm">
            <ArchiveGrid
              media={media}
              isLoadingMore={isLoadingMore}
              isLoadingNewer={isLoadingNewer}
              hasHeldNewer={hasHeldNewer}
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              targetId={targetId}
              onOpen={(cells, index) => setViewer({ cells, index })}
              onToggle={selection.toggle}
              onSweepTo={selection.sweepTo}
              // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight for the same reason the header control is disabled — a row with no message attached yet cannot be deleted out from under the send.
              onSweepStart={staging.isUploading ? undefined : selection.startSweep}
              onLoadMore={loadMore}
              onLoadNewer={loadNewer}
              onInsertNewer={insertNewer}
            />
            {staging.remainingCount > 0 && (
              <p className="text-center text-body-sm text-meta">
                {staging.remainingCount}장을 더 올리는 중이에요
              </p>
            )}
          </div>
        )}
      </div>
      {selection.isSelecting && (
        <ArchiveSelectionBar
          selectedCount={selectedCount}
          isBusy={isRemoving}
          onDelete={askToDeleteSelection}
          onSave={startSave}
          onShare={startShare}
        />
      )}
      <MediaShareDialog
        progress={saving.progress}
        blockedCount={saving.blockedCount}
        blockedIntent={saving.blockedIntent}
        onRetry={() => void saving.retryBlocked()}
        onDismiss={saving.dismissBlocked}
      />
      <MediaPickerSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handlePick}
      />
      {staging.sheet}
      {staging.editors}
      <Modal
        isOpen={isConfirmingDelete}
        header={{
          title: toDeleteTitle(pendingDelete),
          description: toDeleteWarning(pendingDelete),
        }}
        onClose={() => setIsConfirmingDelete(false)}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button
            className="flex-1"
            variant="secondary"
            onClick={() => setIsConfirmingDelete(false)}
          >
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isRemoving}
            haptic
            onClick={() => void confirmDelete()}
          >
            삭제
          </Button>
        </div>
      </Modal>
      {viewer && (
        <MediaViewer
          cells={viewer.cells}
          initialIndex={viewer.index}
          // INFO: DESIGN.md § 7.10. 채팅's own glyph, the one the tab bar and 대화하기 already use — the jump is named by where it lands, and this one lands on a message.
          jump={{ label: "대화에서 보기", Icon: MessageCircle, onSelect: openInChat }}
          // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight, for the reason the 선택 control is disabled — a row whose `postMessage` has not settled would be deleted out from under the send.
          deletion={
            staging.isUploading
              ? undefined
              : { label: "보관함에서 삭제", onSelect: askToDeleteSlide }
          }
          onClose={() => setViewer(null)}
          // WARN: REQUIREMENTS.md § 18. #1. Given for the probe, not for a question — a flat library has no bundle to ask about. The `<a href>` this replaces navigated straight at the object, and the other participant's 삭제 reaches rows on this screen with nothing publishing it, so a slide can name an object that is gone: the anchor took a standalone PWA to a JSON 404 with no way back, where `downloadMedia` says so and stays put.
          onDownload={(mediaId) => void downloadMedia([mediaId])}
          onShare={(mediaId) => void saving.share([mediaId])}
          onSave={(mediaId) => void saving.save([mediaId])}
          onSetBackground={setBackground.open}
        />
      )}
      {/* INFO: REQUIREMENTS.md § 12.1. Mounted outside the viewer conditional above, so dismissing the viewer cannot unmount the sheet mid-write — `useSetBackground` returns the two halves separately for exactly this. */}
      {setBackground.sheet}
      {staging.overlay}
    </div>
  );

  /**
   * REQUIREMENTS.md § 10. Hands the room a target and lets § 8.6.1.'s jump do the
   * rest — it already loads a window around a message that is off the loaded page.
   *
   * WARN: The viewer is dismissed first. It is a `ShellOverlay` and the shell
   * outlives the route change, so left open it would cover the conversation it
   * just travelled to until the transition happened to unmount it.
   */
  function openInChat(cell: MediaCell) {
    // INFO: REQUIREMENTS.md § 10. A row uploaded straight into the library hangs off no message, and neither does one whose message was withdrawn. The control stays where it is and says so — withheld per slide it would be a hole opening and closing in the bar as the reader swipes (`DESIGN.md § 7.10.`).
    if (cell.messageId === null || cell.messageId === undefined) {
      toast.error("이동할 대화가 없어요");

      return;
    }

    setViewer(null);
    router.push(
      `${CHAT_ROUTE}?${new URLSearchParams({ [CHAT_MESSAGE_PARAM]: String(cell.messageId) })}`,
    );
  }

  function handlePick(files: File[]) {
    setIsPickerOpen(false);
    staging.add(files);
  }

  /**
   * WARN: Started, never awaited. Both save routes run the length of the selection —
   * the download path paces itself, the share path buffers every original first — so
   * awaiting this would hold the handler behind a bar that is already dismissed.
   */
  function startSave() {
    const ids = selection.selectedIds;

    selection.cancel();
    void saving.save(ids);
  }

  /**
   * REQUIREMENTS.md § 10. 공유 names the sheet outright, so it takes one wherever
   * there is one — unlike 저장, which only routes that way on iOS.
   *
   * WARN: The cap is answered here, before the selection is dropped. This control
   * renders where the selection may run to `MAX_ARCHIVE_SELECTION`, ten times what
   * a sheet can be handed, and letting it through would fall back to a download of
   * two hundred files — which is not what 공유 was asked for, and would cost the
   * user the sweep they just made on the way.
   */
  function startShare() {
    const ids = selection.selectedIds;

    if (!isShareableSelection(ids)) {
      toast.error(toShareCapMessage());

      return;
    }

    selection.cancel();
    void saving.share(ids);
  }

  // INFO: REQUIREMENTS.md § 10. Counted rather than named, and 사진 whatever the selection holds — the shelf's own counter says 장 of a video as readily, so only a single named slide is specific enough to be wrong.
  function askToDeleteSelection() {
    askToDelete({ ids: selection.selectedIds, subject: `${selectedCount}장`, noun: "사진" });
  }

  /**
   * REQUIREMENTS.md § 10. The viewer's 삭제, which removes the library row alone —
   * the message the photo was sent in keeps it, which is what the confirmation says.
   */
  function askToDeleteSlide(mediaId: string) {
    const noun = viewer?.cells.find((item) => item.id === mediaId)?.isVideo ? "동영상" : "사진";

    askToDelete({ ids: [mediaId], subject: `이 ${noun}`, noun });
  }

  function askToDelete(pending: PendingDelete) {
    setPendingDelete(pending);
    setIsConfirmingDelete(true);
  }

  /**
   * REQUIREMENTS.md § 10. Takes the deleted rows out of the open viewer rather than
   * dismissing it — `cells` is the snapshot taken when the tile was tapped, so a
   * viewer left alone keeps showing an object that no longer resolves.
   *
   * WARN: `index` is deliberately left where it stood — it is `MediaViewer`'s `initialIndex`, the offset the viewer *opened* at, and nothing here reopens it. The reader's real position is the held slide's id, and the viewer re-asserts the offset from that once the removed slide's box is gone — which is the next photo, already under them.
   */
  function dropFromViewer(ids: string[]) {
    const removed = new Set(ids);

    setViewer((previous) => {
      if (previous === null) {
        return null;
      }

      const remaining = previous.cells.filter((cell) => !removed.has(cell.id));

      // INFO: The last row on the shelf has no next photo to fall to, so there is nothing left for the viewer to show.
      return remaining.length === 0 ? null : { ...previous, cells: remaining };
    });
  }

  async function confirmDelete() {
    if (pendingDelete === null) {
      return;
    }

    const { ids, noun } = pendingDelete;

    setIsRemoving(true);

    try {
      await deleteArchiveMedia(ids);
      remove(ids);
      selection.cancel();
      setIsConfirmingDelete(false);
      dropFromViewer(ids);
    } catch {
      toast.error(`${josa(noun, "을/를")} 삭제하지 못했어요`);
    } finally {
      setIsRemoving(false);
    }
  }
}

/** The rows one confirmation is for, the subject naming them in its title, and the noun every sentence under it takes. */
type PendingDelete = { ids: string[]; subject: string; noun: string };

// INFO: AGENTS.md § 0.4. The subject varies (`3장`, `이 동영상`), so the particle is chosen rather than written into a sentence two of them reach.
function toDeleteTitle(pending: Nullable<PendingDelete>): string {
  return pending === null ? "" : `${josa(pending.subject, "을/를")} 삭제할까요?`;
}

// INFO: REQUIREMENTS.md § 18. #1. The one thing a user cannot tell from the button — what is deleted leaves the library and stays in the conversation.
function toDeleteWarning(pending: Nullable<PendingDelete>): string {
  return `대화에 보낸 ${josa(pending?.noun ?? "사진", "은/는")} 말풍선에 그대로 남아요`;
}
