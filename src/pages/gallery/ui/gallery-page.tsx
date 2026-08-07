"use client";

import type { GalleryMedia, MediaDraft } from "@/entities/media";
import { useSetBackground } from "@/features/set-background";
import {
  FileDropOverlay,
  MediaEditor,
  MediaPickerSheet,
  MediaTray,
  useAttachmentEditing,
  useFileDrop,
  useMediaSelection,
  VideoTrimmer,
} from "@/features/upload-media";
import { cn, type Nullable } from "@/shared/lib";
import {
  isShareableSelection,
  MediaShareDialog,
  SHARE_CAP_MESSAGE,
  useMediaShare,
} from "@/shared/share";
import {
  AppHeader,
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  MediaViewer,
  Modal,
  ShellOverlay,
  toast,
  type MediaCell,
} from "@/shared/ui";
import {
  deleteGalleryMedia,
  GalleryGrid,
  GallerySelectionBar,
  useGalleryMedia,
  useGallerySelection,
  useGalleryUpload,
} from "@/widgets/gallery-grid";
import { ImagePlus, Images, ListChecks, X } from "lucide-react";
import { useState } from "react";

export type GalleryPageProps = {
  className?: string;
  initialMedia: GalleryMedia[];
};

/**
 * REQUIREMENTS.md § 10. Everything the conversation has ever exchanged, newest
 * first — `media` is the single source, so nothing here is a copy of a chat row.
 */
export function GalleryPage({ className, initialMedia }: GalleryPageProps) {
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // INFO: REQUIREMENTS.md § 10. The pick, staged for editing before anything is uploaded. The same hook the composer's tray uses (§ 9.), so both screens edit an attachment the same way.
  const staging = useMediaSelection();
  const editing = useAttachmentEditing(staging.replace);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useGalleryMedia(initialMedia);
  const selection = useGallerySelection();
  const setBackground = useSetBackground();
  const saving = useMediaShare();
  const { remainingCount, isBusy: isUploading, upload } = useGalleryUpload(prepend);
  // INFO: REQUIREMENTS.md § 9.2. Refused while a selection is up — a drop would upload into the grid the bar is about to delete from, which is the very window § 10. closes by withholding selection during an upload.
  // WARN: REQUIREMENTS.md § 9.2. Refused under an editor or the viewer too. React bubbles a drop through the *component* tree, so those overlays deliver one here however they are portalled — and the staging sheet is suppressed for exactly their duration, so the drop would land in a tray the user cannot see.
  const fileDrop = useFileDrop({
    isEnabled:
      !selection.isSelecting && editing.cropping === null && editing.trimming === null && !viewer,
    onDrop: handlePick,
  });
  const selectedCount = selection.selectedIds.length;

  return (
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole screen, so photos dragged anywhere over the grid stage rather than having to find the 사진 추가 control.
    <div className={cn("flex flex-1 flex-col", className)} {...fileDrop.handlers}>
      <AppHeader
        title={selection.isSelecting ? `${selectedCount}장 선택` : "갤러리"}
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
              {/* WARN: Unavailable while an upload is in flight. A photo being posted is in the grid with no message attached yet, which is exactly what `removeGalleryMedia` reads as "delete it outright" — deleting it there would take the row out from under the `postMessage` that was about to reference it. */}
              <IconButton
                variant="floating"
                Icon={ListChecks}
                disabled={media.length === 0 || isUploading}
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
        {media.length === 0 && remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={Images} description="아직 주고받은 사진이 없어요" />
          </div>
        ) : (
          <div className="space-y-sm">
            <GalleryGrid
              media={media}
              isLoadingMore={isLoadingMore}
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              onOpen={(cells, index) => setViewer({ cells, index })}
              onToggle={selection.toggle}
              onSweepTo={selection.sweepTo}
              // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight for the same reason the header control is disabled — a row with no message attached yet cannot be deleted out from under the send.
              onSweepStart={isUploading ? undefined : selection.startSweep}
              onLoadMore={loadMore}
            />
            {remainingCount > 0 && (
              <p className="text-center text-body-sm text-meta">
                {remainingCount}장을 더 올리는 중이에요
              </p>
            )}
          </div>
        )}
      </div>
      {selection.isSelecting && (
        <GallerySelectionBar
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
      {/* INFO: REQUIREMENTS.md § 10. The pick is staged before it goes up, so each item can be cropped or trimmed and any of them dropped — the gallery used to upload straight off the picker, which gave the user nowhere to correct a bad frame. */}
      {/* WARN: REQUIREMENTS.md § 13.4. Closed while either editor is up. They portal into the app shell and this drawer portals into `body`, so no z-index inside the shell can lift them over it — the sheet has to get out of the way instead. */}
      <BottomSheet
        header={{ title: "사진 추가", description: "올리기 전에 하나씩 편집할 수 있어요" }}
        isOpen={
          (staging.drafts.length > 0 || staging.isReading) &&
          editing.cropping === null &&
          editing.trimming === null
        }
        onClose={cancelStaging}
      >
        <div className="space-y-md">
          <MediaTray
            drafts={staging.drafts}
            isReading={staging.isReading}
            onEdit={editing.open}
            onRemove={staging.remove}
          />
          {/* INFO: REQUIREMENTS.md § 10. The gallery is the shared album, so posting to the conversation is the default and not posting is the option beside it. */}
          {/* WARN: Both are held while a trim is being read back. The trimmer is already gone by then, so an upload started in that window would ship the untrimmed original and the `replace` behind it would land on a draft `takeAll` had removed. */}
          <div className="space-y-xs">
            <Button
              disabled={staging.drafts.length === 0 || staging.isReading || editing.isApplying}
              haptic
              onClick={() => void startUpload({ shouldPost: true })}
            >
              대화에도 보내기
            </Button>
            <Button
              variant="secondary"
              disabled={staging.drafts.length === 0 || staging.isReading || editing.isApplying}
              haptic
              onClick={() => void startUpload({ shouldPost: false })}
            >
              갤러리에만 추가
            </Button>
          </div>
        </div>
      </BottomSheet>
      {editing.cropping && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a second photo must be a second mount.
        <MediaEditor
          key={editing.cropping.id}
          draft={editing.cropping}
          onCancel={editing.close}
          onDone={editing.applyCrop}
        />
      )}
      {editing.trimming && renderTrimmer(editing.trimming)}
      <Modal
        isOpen={isConfirmingDelete}
        header={{
          title: `${selectedCount}장을 삭제할까요?`,
          // INFO: REQUIREMENTS.md § 18. #1. The one thing a user cannot tell from the button — the photo leaves the gallery and stays in the conversation.
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
      {/* WARN: REQUIREMENTS.md § 9.2. Portalled, unlike the chat room's. This screen *is* the scroller's content, so an `absolute inset-0` left inside it spans every month ever loaded and centres the label somewhere far below the fold; the shell box is the one element sized to what the user can see. */}
      <ShellOverlay>
        <FileDropOverlay isActive={fileDrop.isDropping} label="여기에 놓으면 추가돼요" />
      </ShellOverlay>
    </div>
  );

  function handlePick(files: File[]) {
    setIsPickerOpen(false);
    void staging.add(files);
  }

  // INFO: The draft is bound here rather than read back inside the callback — `applyTrim` clears `editing.trimming`, so a callback reading it again would be handed `null`.
  function renderTrimmer(source: MediaDraft) {
    return (
      // INFO: No `maxDurationMs` — a gallery attachment has no length cap (§ 9.), so both handles move.
      <VideoTrimmer
        key={source.id}
        draft={source}
        onCancel={editing.close}
        onDone={(file) => void editing.applyTrim(source, file)}
      />
    );
  }

  function cancelStaging() {
    staging.clear();
    editing.close();
  }

  /**
   * WARN: `takeAll`, not a read of `staging.drafts`. It empties the tray without
   * revoking the previews, and `upload` revokes each one as it settles — leaving the
   * hook to revoke them on unmount instead would kill the blob mid-upload.
   */
  async function startUpload({ shouldPost }: { shouldPost: boolean }) {
    const drafts = staging.takeAll();

    editing.close();

    if (drafts.length > 0) {
      await upload(drafts, { shouldPost });
    }
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
   * renders where the selection may run to `MAX_GALLERY_SELECTION`, ten times what
   * a sheet can be handed, and letting it through would fall back to a download of
   * two hundred files — which is not what 공유 was asked for, and would cost the
   * user the sweep they just made on the way.
   */
  function startShare() {
    const ids = selection.selectedIds;

    if (!isShareableSelection(ids)) {
      toast.error(SHARE_CAP_MESSAGE);

      return;
    }

    selection.cancel();
    void saving.share(ids);
  }

  async function confirmDelete() {
    const ids = selection.selectedIds;

    setIsRemoving(true);

    try {
      await deleteGalleryMedia(ids);
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
