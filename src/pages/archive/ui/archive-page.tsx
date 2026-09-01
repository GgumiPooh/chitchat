"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useApplyPhoto } from "@/features/apply-photo";
import { useWriteArchiveSnapshot } from "@/features/offline-snapshot";
import { stageArchiveMedia } from "@/features/send-message";
import { useSilentSend } from "@/features/silent-send";
import { useMediaPicker } from "@/features/upload-media";
import {
  CHAT_MESSAGE_PARAM,
  CHAT_MODE_PARAM,
  CHAT_ROUTE,
  toMediaLabel,
  type ArchiveModeFilter,
} from "@/shared/config";
import { cn, startMediaMorph, type MediaId, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  downloadMedia,
  isShareableSelection,
  MediaShareDialog,
  toShareCapMessage,
  useMediaShare,
} from "@/shared/share";
import { AppHeader, EmptyState, IconButton, MediaViewer, toast, type MediaCell } from "@/shared/ui";
import {
  ArchiveColumnsSheet,
  ArchiveGrid,
  ArchiveSelectionBar,
  findArchiveTile,
  useArchiveColumns,
  useArchiveMedia,
  useArchiveRemoval,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { ImagePlus, Images, LayoutGrid, ListChecks, MessageCircle, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useArchiveJump } from "../model/archive-jump-context";
import { useInvalidateArchiveMonthCounts } from "../model/archive-month-counts-context";
import { ArchiveFilterButton } from "./archive-filter-button";
import { LibrarySegments } from "./library-segments";

export type ArchivePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
  /** REQUIREMENTS.md § 10. The photo 채팅's viewer sent the reader here to see, from `?target=`; the window above already came back centred on it. */
  targetId?: MediaId;
  /** REQUIREMENTS.md § 10. The 보기 옵션 mode `initialMedia` was drawn under — paging must ask with the same one, or the pages beyond the first window ignore the filter. */
  modeFilter?: ArchiveModeFilter;
};

/**
 * REQUIREMENTS.md § 10. 보관함's 사진 segment — everything the conversation has ever
 * exchanged, newest first. `media` is the single source, so nothing here is a copy
 * of a chat row.
 */
export function ArchivePage({
  className,
  initialMedia,
  targetId,
  modeFilter = "all",
}: ArchivePageProps) {
  const silentSend = useSilentSend();
  const router = useRouter();
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  // WARN: DESIGN.md § 4.7.3. The slide the open viewer is on, held here since the grid needs it as a prop and the viewer owns position by id (§ 8.1.). Handed to the grid only while the viewer is open — that gate, not clearing on every dismiss path, is what keeps a stale value from re-centring the shelf.
  const [revealId, setRevealId] = useState<Nullable<MediaId>>(null);
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
  } = useArchiveMedia(initialMedia, "gallery", targetId, modeFilter);
  useWriteArchiveSnapshot("archive-gallery", modeFilter === "all" ? media : null);
  // INFO: REQUIREMENTS.md § 10. The `lg` panel's totals follow what this grid adds and removes.
  const invalidateMonthCounts = useInvalidateArchiveMonthCounts();
  // INFO: § 18. #1. 삭제, its confirmation and the reconciliation of what the server took — all three shelves share it (`useArchiveRemoval`).
  const removal = useArchiveRemoval({
    noun: "photo",
    onRemoved: (ids) => {
      remove(ids);
      selection.cancel();
      dropFromViewer(ids);
      invalidateMonthCounts();
    },
  });
  const selection = useArchiveSelection();
  const applyPhoto = useApplyPhoto();
  const saving = useMediaShare();
  // INFO: REQUIREMENTS.md § 9.2. Blocked while a selection is up — a drop would upload into the grid the bar is about to delete from.
  // INFO: § 9.1. `acceptsFiles: false` — the grid draws thumbnails and a `.zip` has none, so a file dropped here is refused with actionable copy instead of being quietly filed onto another shelf.
  const staging = useShelfStaging({
    shelf: "gallery",
    acceptsFiles: false,
    isBlocked: selection.isSelecting || viewer !== null,
    onAdded: prepend,
    onLanded: invalidateMonthCounts,
  });
  // INFO: REQUIREMENTS.md § 10. 갤러리 추가 opens the album picker outright — this shelf takes photos and videos and nothing else, so there was never a choice for a sheet to offer.
  const picker = useMediaPicker({ isMultiple: true, onSelect: staging.add });
  const selectedCount = selection.selectedIds.length;
  const uploadGate = useOfflineGate(OFFLINE_MESSAGES.upload);
  // INFO: REQUIREMENTS.md § 10. Every action the selection bar offers — 저장, 공유, 삭제 — needs the network, so entering selection offline is three dead ends and a count.
  const selectGate = useOfflineGate(OFFLINE_MESSAGES.select);
  const { columns, setColumns } = useArchiveColumns();
  // INFO: AGENTS.md § 4.1. 열 개수 — the header's own control for a pointer that cannot pinch.
  const [isColumnsSheetOpen, setIsColumnsSheetOpen] = useState(false);
  // INFO: AGENTS.md § 4.1. The `lg` panel's month list — `token` is what makes tapping the same month twice scroll twice.
  const [jumpTo, setJumpTo] = useState<Nullable<{ monthKey: string; token: number }>>(null);
  // INFO: AGENTS.md § 4.1. `archive/layout.tsx`'s panel persists across shelf routes and reaches this grid's own `jumpTo` state through the wire `ArchiveJumpProvider` is.
  const { registerJumpHandler } = useArchiveJump();

  useEffect(
    () =>
      registerJumpHandler((monthKey) =>
        setJumpTo((previous) => ({ monthKey, token: (previous?.token ?? 0) + 1 })),
      ),
    [registerJumpHandler],
  );

  return (
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole screen, so photos dragged anywhere over the grid stage rather than having to find the 갤러리 추가 control.
    <div className={cn("flex flex-1 flex-col", className)} {...staging.dropHandlers}>
      <AppHeader
        containerClassName="max-w-none"
        hasSidePanel
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
              {/* INFO: AGENTS.md § 4.1. 열 개수 — the same column state the pinch drives, for a pointer that cannot pinch. */}
              <IconButton
                variant="floating"
                Icon={LayoutGrid}
                haptic
                aria-label="열 개수"
                onClick={() => setIsColumnsSheetOpen(true)}
              />
              <IconButton
                variant="floating"
                Icon={ImagePlus}
                haptic
                aria-label="갤러리 추가"
                {...uploadGate.blockedProps}
                onClick={uploadGate.guard(picker.open)}
              />
              <ArchiveFilterButton />
              {/* WARN: Unavailable while an upload is in flight. A photo being posted is in the grid with no message behind it yet, which `isInLibrary()` does not admit — a 삭제 aimed at it would silently take nothing. */}
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
        {/* INFO: REQUIREMENTS.md § 10. Withheld in selection mode, as the header's own controls are — a segment tap there is a navigation that would drop the selection with nothing having said so. */}
        {/* INFO: AGENTS.md § 4.1. `lg`'s panel carries the vertical version — below it this stays the chip row. */}
        {!selection.isSelecting && <LibrarySegments className="pb-sm lg:hidden" />}
        {media.length === 0 && staging.remainingCount === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState Icon={Images} description="보관된 사진이 없어요" />
          </div>
        ) : (
          <div className="space-y-sm">
            <ArchiveGrid
              media={media}
              columns={columns}
              jumpTo={jumpTo ?? undefined}
              isLoadingMore={isLoadingMore}
              isLoadingNewer={isLoadingNewer}
              hasHeldNewer={hasHeldNewer}
              isSelecting={selection.isSelecting}
              selected={selection.selected}
              targetId={targetId}
              revealId={viewer ? (revealId ?? undefined) : undefined}
              // INFO: DESIGN.md § 4.7.3. The tile expands into the slide rather than the viewer cutting in over it; `startMediaMorph` falls back to the plain open wherever the transition cannot run, so there is no branch here.
              onOpen={(cells, index, origin) =>
                startMediaMorph(origin, () => setViewer({ cells, index }))
              }
              onColumnsChange={setColumns}
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
          isBusy={removal.isRemoving}
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
      <ArchiveColumnsSheet
        isOpen={isColumnsSheetOpen}
        columns={columns}
        onColumnsChange={setColumns}
        onClose={() => setIsColumnsSheetOpen(false)}
      />
      {picker.input}
      {staging.sheet}
      {staging.editors}
      {removal.overlays}
      {viewer && (
        <MediaViewer
          cells={viewer.cells}
          initialIndex={viewer.index}
          // INFO: DESIGN.md § 4.7.3. The return journey — the slide collapses back into its tile wherever the grid still has one on screen, and fades where it stands otherwise.
          findMorphOrigin={findArchiveTile}
          // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight, for the reason the 선택 control is disabled — a row whose `postMessage` has not settled is not in the library yet, so the tap would take nothing.
          deletion={staging.isUploading ? undefined : { label: "삭제", onSelect: askToDeleteSlide }}
          // INFO: DESIGN.md § 7.10. 채팅's own glyph, the one the tab bar and 대화하기 already use — the jump is named by where it lands, and this one lands on a message.
          // INFO: REQUIREMENTS.md § 10. 채팅으로 보내기 sits beside it — both land in 채팅, one on the sent bubble and one in the composer's own tray.
          jump={[
            { label: "대화에서 보기", Icon: MessageCircle, onSelect: openInChat },
            {
              label: "채팅으로 보내기",
              Icon: Send,
              onSelect: sendToChat,
              // INFO: A draft still uploading has no stored object and therefore no `downloadUrl` yet — the same signal 사진 사용하기 already gates on.
              isAvailable: (cell) => cell.downloadUrl !== null,
            },
          ]}
          onClose={() => setViewer(null)}
          // INFO: DESIGN.md § 4.7.3. Keeps the grid on whatever the reader has swiped to, so 닫기 has a tile to shrink into however far the track has carried them.
          onSlideChange={setRevealId}
          // WARN: REQUIREMENTS.md § 18. #1. Replaces a plain `<a href>` — the other participant's 삭제 can make a slide name an object that's already gone, and the anchor took a standalone PWA to a dead-end JSON 404; `downloadMedia` says so and stays put instead.
          onDownload={(mediaId) => void downloadMedia([mediaId])}
          onShare={(mediaId) => void saving.share([mediaId])}
          onSave={(mediaId) => void saving.save([mediaId])}
          onApplyPhoto={applyPhoto.open}
        />
      )}
      {/* INFO: REQUIREMENTS.md § 12.1. Mounted outside the viewer conditional above, so dismissing the viewer cannot unmount the sheet mid-write — `useApplyPhoto` returns the two halves separately for exactly this. */}
      {applyPhoto.sheet}
      {staging.overlay}
    </div>
  );

  // WARN: REQUIREMENTS.md § 10. The viewer is dismissed first — it's a `ShellOverlay` that outlives the route change, so left open it would cover the chat until the transition happened to unmount it.
  function openInChat(cell: MediaCell) {
    // INFO: REQUIREMENTS.md § 10. A tile with no message (in-flight upload, or withdrawn) still shows the control, just disabled — hiding it per slide would open and close a hole in the bar as the reader swipes.
    if (cell.messageId === null || cell.messageId === undefined) {
      toast.error("이동할 대화가 없어요");

      return;
    }

    setViewer(null);

    // WARN: REQUIREMENTS.md § 16.1. 채팅창에서 '나에게만 보내기' 메시지를 정확히 찾으려면 채팅창 모드도 동일해야 함.
    const targetMode = cell.onlyMe ? "onlyMe" : "notify";
    silentSend.setMode(targetMode);

    const params = new URLSearchParams({ [CHAT_MESSAGE_PARAM]: String(cell.messageId) });
    if (cell.onlyMe) {
      params.set(CHAT_MODE_PARAM, "onlyMe");
    }
    router.push(`${CHAT_ROUTE}?${params}`);
  }

  // INFO: REQUIREMENTS.md § 10. 채팅으로 보내기 — stages the slide for the composer's own tray and lands in it plain, unlike `openInChat` above there is no message or mode to carry.
  function sendToChat(cell: MediaCell) {
    const item = media.find((entry) => entry.id === cell.id);

    if (!item) {
      return;
    }

    setViewer(null);
    stageArchiveMedia([item]);
    router.push(CHAT_ROUTE);
  }

  // WARN: Started, never awaited — both save routes run the length of the selection, so awaiting would hold the handler behind a bar that's already dismissed.
  function startSave() {
    const ids = selection.selectedIds;

    selection.cancel();
    void saving.save(ids);
  }

  // WARN: REQUIREMENTS.md § 10. The cap is checked before the selection is dropped — the selection may run to `MAX_ARCHIVE_SELECTION`, ten times what a share sheet can take, and letting it through would silently fall back to a download instead.
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
    removal.ask({ ids: selection.selectedIds, subject: `${selectedCount}장` });
  }

  // INFO: REQUIREMENTS.md § 10. The viewer's 삭제, same destroy as the selection bar's — the slide is one row rather than a selection, so the subject is named instead of counted.
  function askToDeleteSlide(mediaId: MediaId) {
    const noun = viewer?.cells.find((item) => item.id === mediaId)?.isVideo ? "video" : "photo";

    removal.ask({ ids: [mediaId], subject: `이 ${toMediaLabel(noun)}`, noun });
  }

  // WARN: REQUIREMENTS.md § 10. Takes the deleted rows out of the open viewer rather than dismissing it — `cells` is a tap-time snapshot, so a viewer left alone would keep showing an object that no longer resolves. `index` is left as `MediaViewer`'s `initialIndex` untouched; the viewer re-asserts position from the held slide's own id.
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
}
