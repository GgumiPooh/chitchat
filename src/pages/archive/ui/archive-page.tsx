"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useSetBackground } from "@/features/set-background";
import { MediaPickerSheet } from "@/features/upload-media";
import { cn, type Nullable } from "@/shared/lib";
import {
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
import { ImagePlus, Images, ListChecks, X } from "lucide-react";
import { useState } from "react";
import { LibrarySegments } from "./library-segments";

export type ArchivePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
};

/**
 * REQUIREMENTS.md § 10. 보관함's 사진 segment — everything the conversation has ever
 * exchanged, newest first. `media` is the single source, so nothing here is a copy
 * of a chat row.
 */
export function ArchivePage({ className, initialMedia }: ArchivePageProps) {
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useArchiveMedia(initialMedia);
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
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              onOpen={(cells, index) => setViewer({ cells, index })}
              onToggle={selection.toggle}
              onSweepTo={selection.sweepTo}
              // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight for the same reason the header control is disabled — a row with no message attached yet cannot be deleted out from under the send.
              onSweepStart={staging.isUploading ? undefined : selection.startSweep}
              onLoadMore={loadMore}
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
          onSave={startSave}
          onShare={startShare}
          onDelete={() => setIsConfirmingDelete(true)}
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
          title: `${selectedCount}장을 삭제할까요?`,
          // INFO: REQUIREMENTS.md § 18. #1. The one thing a user cannot tell from the button — the photo leaves the library and stays in the conversation.
          description: "대화에 보낸 사진은 말풍선에 그대로 남아요",
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
          onClose={() => setViewer(null)}
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

  async function confirmDelete() {
    const ids = selection.selectedIds;

    setIsRemoving(true);

    try {
      await deleteArchiveMedia(ids);
      remove(ids);
      selection.cancel();
      setIsConfirmingDelete(false);
    } catch {
      toast.error("사진을 삭제하지 못했어요");
    } finally {
      setIsRemoving(false);
    }
  }
}
