"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useWriteArchiveSnapshot } from "@/features/offline-snapshot";
import { toVoiceDraft, VoiceRecorderBar, type VoiceRecording } from "@/features/upload-media";
import { cn, stopVoice } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { downloadMedia } from "@/shared/share";
import { AppHeader, EmptyState, IconButton, ShellOverlay, toast } from "@/shared/ui";
import {
  ArchiveSelectionBar,
  ArchiveVoiceList,
  toMonthAnchorId,
  useArchiveMedia,
  useArchiveRemoval,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { AudioLines, ListChecks, Mic, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useArchiveJump } from "../model/archive-jump-context";
import { ArchiveFilterButton } from "./archive-filter-button";
import { LibrarySegments } from "./library-segments";

export type ArchiveVoicePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
};

/**
 * REQUIREMENTS.md § 10. 보관함's 음성 segment — every § 9.3. recording the pair has
 * exchanged. No 공유: `extensionForMime` has no answer for `audio/mp4`, so the share
 * sheet would be handed `{uuid}.bin` and a recording has no `media.filename` to name
 * it by. 저장 is unaffected, since the server names the download itself.
 */
export function ArchiveVoicePage({ className, initialMedia }: ArchiveVoicePageProps) {
  const [isRecording, setIsRecording] = useState(false);
  const { media, isLoadingMore, loadMore, prepend, remove } = useArchiveMedia(
    initialMedia,
    "voice",
  );

  useWriteArchiveSnapshot("archive-voice", media);
  // INFO: REQUIREMENTS.md § 9.3. `savesToPhotoLibrary: false` — a recording downloads on iOS too, so neither the § 10. cap nor the merged 저장/공유 row applies.
  // INFO: § 18. #1. 삭제, its confirmation and the reconciliation of what the server took — shared with the other two shelves (`useArchiveRemoval`).
  const removal = useArchiveRemoval({
    noun: "voice",
    onRemoved: (ids) => {
      remove(ids);
      selection.cancel();
    },
  });
  const selection = useArchiveSelection({ savesToPhotoLibrary: false, countUnit: "개" });
  // INFO: § 9.2. Takes a drop like the other two shelves, but a recording can never arrive this way — its waveform (§ 9.3.) is only ever extracted while recording; `useArchiveUpload`'s closing toast says where a dropped file went instead.
  const staging = useShelfStaging({
    shelf: "voice",
    acceptsFiles: true,
    isBlocked: selection.isSelecting || isRecording,
    onAdded: prepend,
  });
  const selectedCount = selection.selectedIds.length;
  const uploadGate = useOfflineGate(OFFLINE_MESSAGES.upload);
  // INFO: REQUIREMENTS.md § 10. Every action the selection bar offers — 저장, 공유, 삭제 — needs the network, so entering selection offline is three dead ends and a count.
  const selectGate = useOfflineGate(OFFLINE_MESSAGES.select);
  // INFO: AGENTS.md § 4.1. This shelf carries no virtualizer, so the panel's month list scrolls to the section's own `<section id>` directly.
  const jumpToMonth = useCallback((monthKey: string) => {
    document.getElementById(toMonthAnchorId(monthKey))?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);
  // INFO: AGENTS.md § 4.1. `archive/layout.tsx`'s panel persists across shelf routes and reaches this page's own jump through the wire `ArchiveJumpProvider` is.
  const { registerJumpHandler } = useArchiveJump();

  useEffect(() => registerJumpHandler(jumpToMonth), [registerJumpHandler, jumpToMonth]);

  // WARN: REQUIREMENTS.md § 9.3. The shared audio element outlives the rows addressing it, so leaving this screen has to stop it, exactly as the room does.
  useEffect(() => stopVoice, []);

  return (
    <div className={cn("flex flex-1 flex-col", className)} {...staging.dropHandlers}>
      <AppHeader
        containerClassName="max-w-none"
        hasSidePanel
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
              {/* INFO: REQUIREMENTS.md § 9.3. 녹음, never a file picker — recording is the only way to put a row on this shelf. */}
              {/* WARN: A plain click handler, since it mounts `VoiceRecorderBar` (which opens the mic) — WebKit refuses `getUserMedia` for a stack no tap directly covers. */}
              <IconButton
                variant="floating"
                Icon={Mic}
                disabled={isRecording}
                haptic
                aria-label="녹음"
                {...uploadGate.blockedProps}
                onClick={uploadGate.guard(() => setIsRecording(true))}
              />
              <ArchiveFilterButton />
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
        {!selection.isSelecting && <LibrarySegments className="pb-sm lg:hidden" />}
        {media.length === 0 && staging.remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={AudioLines} description="보관된 음성이 없어요" />
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
                {staging.encodeProgress !== null &&
                  ` · 압축 ${Math.round(staging.encodeProgress * 100)}%`}
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
      {/* WARN: DESIGN.md § 3.3. Portalled into the shell box, not positioned in this screen — an absolute strip left inside it (the document scroller's content) would sit at the bottom of every month ever loaded. */}
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

  // INFO: REQUIREMENTS.md § 10. Staged, not sent outright (unlike the composer, § 9.3.) — a tray of one is also the only way to abandon a recording after hearing what it caught.
  function stageRecording(recording: VoiceRecording) {
    staging.addDraft(toVoiceDraft(recording));
  }

  // WARN: REQUIREMENTS.md § 9.3. The download route directly, never `useMediaShare`'s 저장 — that one exists only to reach the iOS photo library, where a recording has no business. Started, never awaited (§ 10.'s pacing).
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
