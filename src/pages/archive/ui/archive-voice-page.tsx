"use client";

import type { ArchiveMedia } from "@/entities/media";
import { toVoiceDraft, VoiceRecorderBar, type VoiceRecording } from "@/features/upload-media";
import { cn, stopVoice } from "@/shared/lib";
import { downloadMedia } from "@/shared/share";
import { AppHeader, EmptyState, IconButton, ShellOverlay, toast } from "@/shared/ui";
import {
  ArchiveSelectionBar,
  ArchiveVoiceList,
  useArchiveMedia,
  useArchiveRemoval,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { AudioLines, ListChecks, Mic, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LibrarySegments } from "./library-segments";

export type ArchiveVoicePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
};

/**
 * REQUIREMENTS.md § 10. 보관함's 음성 segment — every § 9.3. recording the pair has
 * exchanged, which until this screen existed could not be found again anywhere. It
 * is the same gap 파일 was opened to close.
 *
 * WARN: No 공유. `extensionForMime` has no answer for `audio/mp4`, so the sheet would
 * be handed `{uuid}.bin` — the fault § 9.1. found for files and fixed there by naming
 * each `File` from `media.filename`, which a recording does not have. 저장 is unaffected:
 * the server names the download itself.
 */
export function ArchiveVoicePage({ className, initialMedia }: ArchiveVoicePageProps) {
  const [isRecording, setIsRecording] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useArchiveMedia(
    initialMedia,
    "voice",
  );
  // INFO: REQUIREMENTS.md § 9.3. `savesToPhotoLibrary: false` — a recording downloads on iOS too, so neither the § 10. cap nor the merged 저장/공유 row applies.
  // INFO: The finished restructure. The 숨기기 / 완전히 삭제 choice, its two confirmations and the reconciliation of what the server took — shared with the other two shelves (`useArchiveRemoval`).
  const removal = useArchiveRemoval({
    noun: "voice",
    onRemoved: (ids) => {
      remove(ids);
      selection.cancel();
    },
  });
  const selection = useArchiveSelection({ savesToPhotoLibrary: false, countUnit: "개" });
  // INFO: § 9.2. This shelf takes a drop like the other two, and everything dropped on it is a file or a photo — a recording is the one thing that cannot arrive this way, since the waveform § 9.3. discriminates on is only ever extracted while recording. `useArchiveUpload`'s closing toast is what says where it went.
  const staging = useShelfStaging({
    shelf: "voice",
    acceptsFiles: true,
    isBlocked: selection.isSelecting || isRecording,
    onAdded: prepend,
  });
  const selectedCount = selection.selectedIds.length;

  // WARN: REQUIREMENTS.md § 9.3. The shared element outlives the rows addressing it, so leaving this screen has to stop it — exactly as the room does. Nothing on the next tab draws a transport that could pause a clip still running.
  useEffect(() => stopVoice, []);

  return (
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
              {/* INFO: REQUIREMENTS.md § 9.3. 녹음, never a file picker. An audio file carries no waveform, so picking one here would file it on 파일 and leave this screen unchanged — the one way to put a row on this shelf is to record it. */}
              {/* WARN: The tap sets the flag that **mounts** `VoiceRecorderBar`, and mounting is what opens the microphone. It must stay a plain click handler on the discrete event, or WebKit refuses `getUserMedia` for a stack no tap covers (§ 9.3.). */}
              <IconButton
                variant="floating"
                Icon={Mic}
                disabled={isRecording}
                haptic
                aria-label="녹음"
                onClick={() => setIsRecording(true)}
              />
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
        {!selection.isSelecting && <LibrarySegments className="pb-sm" />}
        {media.length === 0 && staging.remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={AudioLines} description="아직 주고받은 음성이 없어요" />
          </div>
        ) : (
          <div className="space-y-sm">
            <ArchiveVoiceList
              media={media}
              isLoadingMore={isLoadingMore}
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              onToggle={selection.toggle}
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
          onDelete={askToDeleteSelection}
        />
      )}
      {staging.sheet}
      {staging.editors}
      {removal.overlays}
      {/* WARN: DESIGN.md § 3.3. Portalled into the shell box rather than positioned in this screen. The bar has to stand above the tab bar over whatever is scrolled, and this screen *is* the document scroller's content — an absolute strip left inside it would sit at the bottom of every month ever loaded. */}
      {isRecording && (
        <ShellOverlay>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-md pb-[calc(var(--bottom-inset,0px)+var(--spacing-md))]">
            <VoiceRecorderBar onDone={stageRecording} onClose={() => setIsRecording(false)} />
          </div>
        </ShellOverlay>
      )}
      {staging.overlay}
    </div>
  );

  /**
   * INFO: REQUIREMENTS.md § 10. Staged rather than sent outright, which is the
   * opposite of the composer (§ 9.3.) and deliberately so: the room's 완료 *is* the
   * send, while here the two 갈래 have still to be chosen between, and a tray of one
   * is also the only way to abandon a recording after hearing what it caught.
   */
  function stageRecording(recording: VoiceRecording) {
    staging.addDraft(toVoiceDraft(recording));
  }

  /**
   * WARN: REQUIREMENTS.md § 9.3. The download route directly, never `useMediaShare`'s
   * 저장 — that one goes through the iOS share sheet because it is the only way to the
   * **photo library**, where a recording has no business.
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

  // INFO: REQUIREMENTS.md § 10. Counted rather than named — one confirmation covers the whole selection, and the shelf's own noun is what its sentences take.
  function askToDeleteSelection() {
    removal.ask({ ids: selection.selectedIds, subject: `${selectedCount}개` });
  }
}
