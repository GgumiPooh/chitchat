"use client";

import type { GalleryMedia } from "@/entities/media";
import { cn } from "@/shared/lib";
import {
  downloadMedia,
  isShareableSelection,
  MediaShareDialog,
  toShareCapMessage,
  useMediaShare,
} from "@/shared/share";
import { AppHeader, Button, EmptyState, IconButton, Modal, toast } from "@/shared/ui";
import {
  deleteGalleryMedia,
  GalleryFileList,
  GallerySelectionBar,
  useGalleryMedia,
  useGallerySelection,
} from "@/widgets/gallery-grid";
import { Files, ListChecks, X } from "lucide-react";
import { useMemo, useState } from "react";
import { LibrarySegments } from "./library-segments";

export type GalleryFilesPageProps = {
  className?: string;
  initialMedia: GalleryMedia[];
};

/**
 * REQUIREMENTS.md § 10. 보관함's 파일 segment — every § 9.1. attachment the pair has
 * exchanged, which until this screen existed could not be found again anywhere.
 *
 * WARN: No viewer and no 배경으로 설정. § 9.1. serves a file as
 * `Content-Disposition: attachment` whatever the query asks for, so a tap is a
 * download and there is nothing for the § 7.10. viewer to have opened.
 */
export function GalleryFilesPage({ className, initialMedia }: GalleryFilesPageProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { media, isLoadingMore, loadMore, remove } = useGalleryMedia(initialMedia, "file");
  // INFO: REQUIREMENTS.md § 9.1. `savesToPhotoLibrary: false` — a file downloads on iOS too, so neither the cap nor the merged 저장/공유 row of § 10. applies here.
  const selection = useGallerySelection({ savesToPhotoLibrary: false, countUnit: "개" });
  const sharing = useMediaShare();
  const selectedCount = selection.selectedIds.length;
  // WARN: REQUIREMENTS.md § 9.1. What names the `File` handed to the share sheet. R2 keys carry no name and the server's `Content-Disposition` is unreadable here (not CORS-safelisted, and the response has already redirected cross-origin), so without this the pair would be sent `9f3c….bin`.
  // INFO: Memoised on the list, not rebuilt per render — the only reader is 공유, while this screen re-renders on every selection toggle over a list that pages into the hundreds.
  const filenames = useMemo(
    () => Object.fromEntries(media.map((item) => [item.id, item.filename ?? ""])),
    [media],
  );

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title={selection.isSelecting ? `${selectedCount}개 선택` : "보관함"}
        trailing={
          selection.isSelecting ? (
            <IconButton
              variant="floating"
              Icon={X}
              aria-label="선택 취소"
              onClick={selection.cancel}
            />
          ) : (
            // INFO: No 파일 추가 control. § 8.1. sends a file from the composer's `+`, and a file filed here with no bubble to sit in is a document nobody was handed.
            <IconButton
              variant="floating"
              Icon={ListChecks}
              disabled={media.length === 0}
              haptic
              aria-label="선택"
              onClick={() => selection.start()}
            />
          )
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]">
        {!selection.isSelecting && <LibrarySegments className="pb-sm" active="file" />}
        {media.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={Files} description="아직 주고받은 파일이 없어요" />
          </div>
        ) : (
          <GalleryFileList
            media={media}
            isLoadingMore={isLoadingMore}
            isSelecting={selection.isSelecting}
            selected={selection.selected}
            onToggle={selection.toggle}
            onDownload={saveOne}
            onLoadMore={loadMore}
          />
        )}
      </div>
      {selection.isSelecting && (
        <GallerySelectionBar
          selectedCount={selectedCount}
          countUnit="개"
          isBusy={isRemoving}
          savesToPhotoLibrary={false}
          onSave={startSave}
          onShare={startShare}
          onDelete={() => setIsConfirmingDelete(true)}
        />
      )}
      {/* INFO: REQUIREMENTS.md § 10. The buffering wait and the re-tap iOS needs once it has spent the tap's activation — worded for 파일 rather than 사진. */}
      <MediaShareDialog
        progress={sharing.progress}
        blockedCount={sharing.blockedCount}
        blockedIntent={sharing.blockedIntent}
        subject="파일"
        countUnit="개"
        onRetry={() => void sharing.retryBlocked()}
        onDismiss={sharing.dismissBlocked}
      />
      <Modal
        isOpen={isConfirmingDelete}
        header={{
          title: `${selectedCount}개를 삭제할까요?`,
          // INFO: REQUIREMENTS.md § 18. #1. The one thing a user cannot tell from the button — the file leaves 보관함 and stays in the conversation.
          description: "대화에 보낸 파일은 말풍선에 그대로 남아요",
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
    </div>
  );

  function saveOne(id: string) {
    void downloadMedia([id]);
  }

  /**
   * WARN: REQUIREMENTS.md § 9.1. The download route directly, never `useMediaShare`'s
   * 저장. That one runs through the iOS share sheet because it is the only way to the
   * **photo library**, and a document has no business there — on every platform a file
   * belongs in Files or in the downloads folder, which is what a plain download does.
   *
   * WARN: Started, never awaited. `downloadMedia` paces itself across the selection
   * (§ 10.), so awaiting it would hold the handler behind a bar already dismissed.
   */
  function startSave() {
    const ids = selection.selectedIds;

    selection.cancel();
    void downloadMedia(ids);
    toast.success(`${ids.length}개를 저장하고 있어요`);
  }

  /**
   * REQUIREMENTS.md § 10. 공유 names the sheet outright, so it takes one wherever
   * there is one — and it is capped at the tap, before the selection is dropped,
   * because a selection may run to ten times what a sheet accepts.
   *
   * WARN: § 9.1. `names` is not optional here in practice. A file's mime is outside
   * the media allow-list, so the fallback naming has no extension to work from.
   */
  function startShare() {
    const ids = selection.selectedIds;

    if (!isShareableSelection(ids)) {
      toast.error(toShareCapMessage("개"));

      return;
    }

    selection.cancel();
    void sharing.share(ids, { names: filenames, countUnit: "개" });
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
      toast.error("파일을 삭제하지 못했어요");
    } finally {
      setIsRemoving(false);
    }
  }
}
