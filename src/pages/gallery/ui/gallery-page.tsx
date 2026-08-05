"use client";

import type { GalleryMedia } from "@/entities/media";
import { MediaPickerSheet } from "@/features/upload-media";
import { cn, type Nullable } from "@/shared/lib";
import {
  ActionSheet,
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
  deleteGalleryMedia,
  downloadGalleryMedia,
  GalleryGrid,
  GallerySelectionBar,
  useGalleryMedia,
  useGallerySelection,
  useGalleryUpload,
} from "@/widgets/gallery-grid";
import { ImagePlus, Images, ListChecks, MessageCircle, X } from "lucide-react";
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
  const [pendingFiles, setPendingFiles] = useState<Nullable<File[]>>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useGalleryMedia(initialMedia);
  const selection = useGallerySelection();
  const { remainingCount, isBusy: isUploading, upload } = useGalleryUpload(prepend);
  const selectedCount = selection.selectedIds.length;

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
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
                aria-label="사진 추가"
                onClick={() => setIsPickerOpen(true)}
              />
              {/* WARN: Unavailable while an upload is in flight. A photo being posted is in the grid with no message attached yet, which is exactly what `removeGalleryMedia` reads as "delete it outright" — deleting it there would take the row out from under the `postMessage` that was about to reference it. */}
              <IconButton
                variant="floating"
                Icon={ListChecks}
                disabled={media.length === 0 || isUploading}
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
          onDownload={download}
          onDelete={() => setIsConfirmingDelete(true)}
        />
      )}
      <MediaPickerSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handlePick}
      />
      {/* INFO: REQUIREMENTS.md § 10. The gallery is the shared album, so posting to the conversation is the default and not posting is the option beside it. */}
      <ActionSheet
        isOpen={pendingFiles !== null}
        header={{ title: "사진 추가", description: "대화에도 보낼까요?" }}
        items={[
          {
            label: "대화에도 보내기",
            Icon: MessageCircle,
            onSelect: () => void startUpload({ shouldPost: true }),
          },
          {
            label: "갤러리에만 추가",
            Icon: Images,
            onSelect: () => void startUpload({ shouldPost: false }),
          },
        ]}
        onClose={() => setPendingFiles(null)}
      />
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
        />
      )}
    </div>
  );

  function handlePick(files: File[]) {
    setIsPickerOpen(false);
    setPendingFiles(files);
  }

  async function startUpload({ shouldPost }: { shouldPost: boolean }) {
    const files = pendingFiles;

    setPendingFiles(null);

    if (files) {
      await upload(files, { shouldPost });
    }
  }

  /**
   * WARN: Started, never awaited. `downloadGalleryMedia` paces itself across the
   * whole selection, so awaiting it holds this handler for the better part of a
   * minute at the cap — behind a bar that has already been dismissed.
   */
  function download() {
    const ids = selection.selectedIds;

    selection.cancel();
    void downloadGalleryMedia(ids);
    // INFO: The browser's own download UI is the progress report; this is only what says the taps registered, since the selection bar is gone by now.
    toast.success(`${ids.length}장을 저장하고 있어요`);
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
