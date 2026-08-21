"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useWriteArchiveSnapshot } from "@/features/offline-snapshot";
import { MediaPickerSheet } from "@/features/upload-media";
import { cn, stopVoice } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  downloadMedia,
  isShareableSelection,
  MediaShareDialog,
  toShareCapMessage,
  useMediaShare,
} from "@/shared/share";
import { AppHeader, EmptyState, IconButton, toast } from "@/shared/ui";
import {
  ArchiveFileList,
  ArchiveSelectionBar,
  useArchiveMedia,
  useArchiveRemoval,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { FilePlus, Files, ListChecks, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LibrarySegments } from "./library-segments";

export type ArchiveFilesPageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
};

/**
 * REQUIREMENTS.md § 10. 보관함's 파일 segment — every § 9.1. attachment the pair has
 * exchanged, which until this screen existed could not be found again anywhere.
 *
 * WARN: No viewer and no 배경으로 설정. § 9.1. serves a file as
 * `Content-Disposition: attachment` whatever the query asks for, so a tap is a
 * download and there is nothing for the § 7.10. viewer to have opened. An **audio**
 * attachment is the one exception and it is not a viewer either: the row grows a
 * play control beside the card, and the card's own tap still saves.
 */
export function ArchiveFilesPage({ className, initialMedia }: ArchiveFilesPageProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useArchiveMedia(initialMedia, "file");

  useWriteArchiveSnapshot("archive-files", media);
  // INFO: REQUIREMENTS.md § 9.1. `savesToPhotoLibrary: false` — a file downloads on iOS too, so neither the cap nor the merged 저장/공유 row of § 10. applies here.
  // INFO: § 18. #1. 삭제, its confirmation and the reconciliation of what the server took — shared with the other two shelves (`useArchiveRemoval`).
  const removal = useArchiveRemoval({
    noun: "file",
    onRemoved: (ids) => {
      remove(ids);
      selection.cancel();
    },
  });
  const selection = useArchiveSelection({ savesToPhotoLibrary: false, countUnit: "개" });
  const sharing = useMediaShare();
  // INFO: § 9.1. `acceptsFiles: true`, unlike 사진. This shelf draws a named row rather than a thumbnail, so there is nothing a file cannot be shown as — and a photo dropped here is taken too, filed onto 사진 with a toast that says so (§ 10.).
  const staging = useShelfStaging({
    shelf: "file",
    acceptsFiles: true,
    isBlocked: selection.isSelecting,
    onAdded: prepend,
  });
  const selectedCount = selection.selectedIds.length;
  const uploadGate = useOfflineGate(OFFLINE_MESSAGES.upload);
  // INFO: REQUIREMENTS.md § 10. Every action the selection bar offers — 저장, 공유, 삭제 — needs the network, so entering selection offline is three dead ends and a count.
  const selectGate = useOfflineGate(OFFLINE_MESSAGES.select);
  // WARN: REQUIREMENTS.md § 9.3. An audio row plays through the page-wide shared element, so leaving this screen has to stop it — exactly as the room and the 음성 shelf do. Nothing on the next tab draws a transport that could pause a clip still running.
  useEffect(() => stopVoice, []);
  // WARN: REQUIREMENTS.md § 9.1. What names the `File` handed to the share sheet. R2 keys carry no name and the server's `Content-Disposition` is unreadable here (not CORS-safelisted, and the response has already redirected cross-origin), so without this the pair would be sent `9f3c….bin`.
  // INFO: Memoised on the list, not rebuilt per render — the only reader is 공유, while this screen re-renders on every selection toggle over a list that pages into the hundreds.
  const filenames = useMemo(
    () => Object.fromEntries(media.map((item) => [item.id, item.filename ?? ""])),
    [media],
  );

  return (
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole screen, as it is on 사진 — the same staging tray, reached the same way.
    <div className={cn("flex flex-1 flex-col", className)} {...staging.dropHandlers}>
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
            <>
              {/* INFO: REQUIREMENTS.md § 10. A file staged here is sent to the conversation like any other — § 18. #1. left the message as the only thing that puts a row on a shelf. */}
              <IconButton
                variant="floating"
                Icon={FilePlus}
                haptic
                aria-label="파일 추가"
                {...uploadGate.blockedProps}
                onClick={uploadGate.guard(() => setIsPickerOpen(true))}
              />
              <IconButton
                variant="floating"
                Icon={ListChecks}
                disabled={media.length === 0 || staging.isUploading}
                haptic
                aria-label="선택"
                {...selectGate.blockedProps}
                onClick={selectGate.guard(() => selection.start())}
              />
            </>
          )
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex flex-1 flex-col p-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]">
        {!selection.isSelecting && <LibrarySegments className="pb-sm" />}
        {media.length === 0 && staging.remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={Files} description="아직 주고받은 파일이 없어요" />
          </div>
        ) : (
          <div className="space-y-sm">
            <ArchiveFileList
              media={media}
              isLoadingMore={isLoadingMore}
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              onToggle={selection.toggle}
              onDownload={saveOne}
              onLoadMore={loadMore}
            />
            {staging.remainingCount > 0 && (
              <p className="text-center text-body-sm text-meta">
                {staging.remainingCount}개를 더 올리는 중이에요
              </p>
            )}
          </div>
        )}
      </div>
      {selection.isSelecting && (
        <ArchiveSelectionBar
          selectedCount={selectedCount}
          countUnit="개"
          isBusy={removal.isRemoving}
          savesToPhotoLibrary={false}
          onSave={startSave}
          onShare={startShare}
          onDelete={askToDeleteSelection}
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
      {/* INFO: REQUIREMENTS.md § 9.1. The composer's own sheet, with its 파일 row — two inputs rather than one wider `accept`, because an album input that takes everything costs iOS its photo picker entirely. */}
      <MediaPickerSheet
        isOpen={isPickerOpen}
        hasFileRow
        onClose={() => setIsPickerOpen(false)}
        onSelect={handlePick}
      />
      {staging.sheet}
      {staging.editors}
      {removal.overlays}
      {staging.overlay}
    </div>
  );

  function handlePick(files: File[]) {
    setIsPickerOpen(false);
    staging.add(files);
  }

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

  // INFO: REQUIREMENTS.md § 10. Counted rather than named — one confirmation covers the whole selection, and the shelf's own noun is what its sentences take.
  function askToDeleteSelection() {
    removal.ask({ ids: selection.selectedIds, subject: `${selectedCount}개` });
  }
}
