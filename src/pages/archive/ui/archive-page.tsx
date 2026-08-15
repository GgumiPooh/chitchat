"use client";

import type { ArchiveMedia } from "@/entities/media";
import { useSetBackground } from "@/features/set-background";
import { useMediaPicker } from "@/features/upload-media";
import { CHAT_MESSAGE_PARAM, CHAT_ROUTE, toMediaLabel } from "@/shared/config";
import { cn, startMediaMorph, type MediaId, type Nullable } from "@/shared/lib";
import {
  downloadMedia,
  isShareableSelection,
  MediaShareDialog,
  toShareCapMessage,
  useMediaShare,
} from "@/shared/share";
import { AppHeader, EmptyState, IconButton, MediaViewer, toast, type MediaCell } from "@/shared/ui";
import {
  ArchiveGrid,
  ArchiveSelectionBar,
  findArchiveTile,
  useArchiveMedia,
  useArchiveRemoval,
  useArchiveSelection,
  useShelfStaging,
} from "@/widgets/archive-shelves";
import { ImagePlus, Images, ListChecks, MessageCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LibrarySegments } from "./library-segments";

export type ArchivePageProps = {
  className?: string;
  initialMedia: ArchiveMedia[];
  /** REQUIREMENTS.md § 10. The photo 채팅's viewer sent the reader here to see, from `?target=`; the window above already came back centred on it. */
  targetId?: MediaId;
};

/**
 * REQUIREMENTS.md § 10. 보관함's 사진 segment — everything the conversation has ever
 * exchanged, newest first. `media` is the single source, so nothing here is a copy
 * of a chat row.
 */
export function ArchivePage({ className, initialMedia, targetId }: ArchivePageProps) {
  const router = useRouter();
  const [viewer, setViewer] = useState<Nullable<{ cells: MediaCell[]; index: number }>>(null);
  /**
   * DESIGN.md § 4.7.3. The slide the open viewer is on, handed to the grid so it keeps
   * a tile for the closing morph within reach.
   *
   * WARN: Held here rather than read out of the viewer, because the grid needs it as a prop and the viewer owns the position by id (`REQUIREMENTS.md § 8.1.`).
   * WARN: **Handed to the grid only while the viewer is open**, and that gate is what makes it safe rather than the clearing. Three separate paths unmount the viewer — 닫기, the 대화에서 보기 jump, and a 삭제 that empties the track — and each one written to clear this as well is a rule that holds until the fourth is added. Left reaching the grid it would re-centre the shelf on a photo nobody is looking at, one `ArchiveGrid` mount later.
   */
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
  } = useArchiveMedia(initialMedia, "gallery", targetId);
  // INFO: § 18. #1. 삭제, its confirmation and the reconciliation of what the server took — all three shelves share it (`useArchiveRemoval`).
  const removal = useArchiveRemoval({
    noun: "photo",
    onRemoved: (ids) => {
      remove(ids);
      selection.cancel();
      dropFromViewer(ids);
    },
  });
  const selection = useArchiveSelection();
  const setBackground = useSetBackground();
  const saving = useMediaShare();
  // INFO: REQUIREMENTS.md § 9.2. Blocked while a selection is up — a drop would upload into the grid the bar is about to delete from, which is the very window § 10. closes by withholding selection during an upload. The viewer is the other cover; the editors are the hook's own business.
  // INFO: § 9.1. `acceptsFiles: false`, and this is the one shelf that says so. The grid draws thumbnails and a `.zip` has none, so a file dropped here is refused with copy the user can act on rather than quietly filed onto another shelf.
  const staging = useShelfStaging({
    shelf: "gallery",
    acceptsFiles: false,
    isBlocked: selection.isSelecting || viewer !== null,
    onAdded: prepend,
    // INFO: § 18. #1. An upload whose bubble never landed is on no shelf, so its tile comes back off rather than sitting there as a row `isInLibrary()` refuses.
    onStranded: remove,
  });
  // INFO: REQUIREMENTS.md § 10. 갤러리 추가 opens the album picker outright — this shelf takes photos and videos and nothing else, so there was never a choice for a sheet to offer.
  const picker = useMediaPicker({ isMultiple: true, onSelect: staging.add });
  const selectedCount = selection.selectedIds.length;

  return (
    // INFO: REQUIREMENTS.md § 9.2. The drop target is the whole screen, so photos dragged anywhere over the grid stage rather than having to find the 갤러리 추가 control.
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
                aria-label="갤러리 추가"
                onClick={picker.open}
              />
              {/* WARN: Unavailable while an upload is in flight. A photo being posted is in the grid with no message behind it yet, which `isInLibrary()` does not admit — a 삭제 aimed at it would silently take nothing. */}
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
              revealId={viewer ? (revealId ?? undefined) : undefined}
              // INFO: DESIGN.md § 4.7.3. The tile expands into the slide rather than the viewer cutting in over it; `startMediaMorph` falls back to the plain open wherever the transition cannot run, so there is no branch here.
              onOpen={(cells, index, origin) =>
                startMediaMorph(origin, () => setViewer({ cells, index }))
              }
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
      {picker.input}
      {staging.sheet}
      {staging.editors}
      {removal.overlays}
      {viewer && (
        <MediaViewer
          cells={viewer.cells}
          initialIndex={viewer.index}
          // INFO: DESIGN.md § 7.10. 채팅's own glyph, the one the tab bar and 대화하기 already use — the jump is named by where it lands, and this one lands on a message.
          jump={{ label: "대화에서 보기", Icon: MessageCircle, onSelect: openInChat }}
          // WARN: REQUIREMENTS.md § 10. Withheld while an upload is in flight, for the reason the 선택 control is disabled — a row whose `postMessage` has not settled is not in the library yet, so the tap would take nothing.
          deletion={staging.isUploading ? undefined : { label: "삭제", onSelect: askToDeleteSlide }}
          // INFO: DESIGN.md § 4.7.3. The return journey — the slide collapses back into its tile wherever the grid still has one on screen, and fades where it stands otherwise.
          findMorphOrigin={findArchiveTile}
          onClose={() => setViewer(null)}
          // INFO: DESIGN.md § 4.7.3. Keeps the grid on whatever the reader has swiped to, so 닫기 has a tile to shrink into however far the track has carried them.
          onSlideChange={setRevealId}
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
    // INFO: REQUIREMENTS.md § 10. A tile prepended by an upload has no message until its POST lands, and one whose message was withdrawn has none again. The control stays where it is and says so — withheld per slide it would be a hole opening and closing in the bar as the reader swipes (`DESIGN.md § 7.10.`).
    if (cell.messageId === null || cell.messageId === undefined) {
      toast.error("이동할 대화가 없어요");

      return;
    }

    setViewer(null);
    router.push(
      `${CHAT_ROUTE}?${new URLSearchParams({ [CHAT_MESSAGE_PARAM]: String(cell.messageId) })}`,
    );
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
    removal.ask({ ids: selection.selectedIds, subject: `${selectedCount}장` });
  }

  /**
   * REQUIREMENTS.md § 10. The viewer's 삭제, which asks for the same destroy the selection
   * bar's does — the slide is one row rather than a selection, so it is the one place the
   * subject is named instead of counted.
   */
  function askToDeleteSlide(mediaId: MediaId) {
    const noun = viewer?.cells.find((item) => item.id === mediaId)?.isVideo ? "video" : "photo";

    removal.ask({ ids: [mediaId], subject: `이 ${toMediaLabel(noun)}`, noun });
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
}
