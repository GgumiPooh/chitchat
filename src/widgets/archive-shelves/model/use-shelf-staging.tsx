"use client";

import type { ArchiveMedia, MediaDraft } from "@/entities/media";
import {
  FileDropOverlay,
  MediaEditor,
  MediaTray,
  useAttachmentEditing,
  useFileDrop,
  useMediaSelection,
  VideoTrimmer,
} from "@/features/upload-media";
import { isAllowedMediaMime, LIBRARY_SHELF_LABELS, type LibraryShelf } from "@/shared/config";
import { BottomSheet, Button, ShellOverlay } from "@/shared/ui";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useArchiveUpload } from "./use-archive-upload";

export type ShelfStagingParams = {
  /** Which shelf this is running on — it picks the sheet's title and decides which uploads report themselves as having landed elsewhere. */
  shelf: LibraryShelf;
  /**
   * Whether a § 9.1. file attachment may be staged.
   *
   * INFO: 갤러리 says no and the other two say yes. That shelf shows tiles and a
   * `.zip` has none, so a file picked there is a refusal the user can act on
   * (`사진과 동영상만 올릴 수 있어요`); 파일 and 음성 draw rows and take anything.
   */
  acceptsFiles: boolean;
  /** Anything covering the tray a drop would land in — a selection, the viewer (REQUIREMENTS.md § 9.2.). */
  isBlocked: boolean;
  onAdded: (media: ArchiveMedia) => void;
};

/**
 * REQUIREMENTS.md § 9.2., § 10. One staging flow for all three shelves of 보관함:
 * a drop target, the tray it fills, the two editors, and the 대화에 보내기 under it.
 *
 * INFO: A shared hook rather than three copies, and the `isEnabled` predicate below
 * is the reason. § 9.2. makes it an invariant that a drop is refused for the length
 * of a selection and under an editor or the viewer; written out per screen it would
 * drift, and the shelf that drifted would be the one that uploads into a grid its
 * selection bar is about to delete from.
 *
 * INFO: It returns nodes as well as state, the way `useApplyPhoto` does — a shelf
 * wires the whole flow with a spread of `dropHandlers` and three slots, which is what
 * keeps the three screens from each growing their own copy of the sheet.
 */
export function useShelfStaging({ shelf, acceptsFiles, isBlocked, onAdded }: ShelfStagingParams) {
  const staging = useMediaSelection({ acceptsFiles });
  const editing = useAttachmentEditing(staging.replace);
  const { remainingCount, encodeProgress, isBusy, upload } = useArchiveUpload(shelf, onAdded);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const modeParam = searchParams?.get("mode");
  const uploadMode = modeParam === "onlyMe" ? true : modeParam === "shared" ? false : undefined;

  // WARN: REQUIREMENTS.md § 9.2. Refused under an editor as well as behind `isBlocked`. React bubbles a drop through the *component* tree, so `MediaEditor` and `VideoTrimmer` deliver one here however they are portalled — and the sheet is suppressed for exactly their duration, so the drop would land in a tray the user cannot see.
  const drop = useFileDrop({
    isEnabled: !isBlocked && !editing.isEditing,
    onDrop: (files) => void staging.add(files),
  });
  const isHeld = staging.drafts.length === 0 || staging.isReading || editing.isApplying || isCommitting || isCanceling;

  return {
    dropHandlers: drop.handlers,
    remainingCount,
    encodeProgress,
    isUploading: isBusy,
    add: (files: File[]) => void staging.add(files),
    /** REQUIREMENTS.md § 9.3. What the 음성 shelf's recorder hands over — a finished draft rather than a file to decode. */
    addDraft: staging.addDraft,
    overlay: renderOverlay(),
    sheet: renderSheet(),
    editors: renderEditors(),
  };

  /**
   * WARN: REQUIREMENTS.md § 9.2. Portalled into the shell box, unlike the chat
   * room's. A shelf *is* the document scroller's content, so an `absolute inset-0`
   * overlay left inside it spans every month ever loaded and centres its label far
   * below the fold. `ShellOverlay` is the box that stays on screen (DESIGN.md § 3.3.).
   */
  // WARN: Mounted only while a drag is over the shelf, never left up at `isActive={false}`. `ShellOverlay` is a `fixed` box on both viewport edges, and iOS 26 Safari paints its status bar and toolbar opaque for as long as one is there — an always-mounted overlay cost 보관함 the transparent chrome every other tab has (DESIGN.md § 3.3.).
  function renderOverlay() {
    return drop.isDropping ? (
      <ShellOverlay>
        <FileDropOverlay isActive label="여기에 놓으면 추가돼요" />
      </ShellOverlay>
    ) : null;
  }

  /**
   * INFO: REQUIREMENTS.md § 10. The pick is staged before it goes up, so each item
   * can be edited and any of them dropped — 보관함 used to upload straight off the
   * picker, which gave the user nowhere to correct a bad frame.
   *
   * WARN: REQUIREMENTS.md § 13.4. Closed while either editor is up. They portal into
   * the app shell and this drawer portals into `body`, so no z-index inside the shell
   * can lift them over it — the sheet has to get out of the way instead.
   */
  function renderSheet() {
    const description = uploadMode === true 
      ? "나만 볼 수 있게 보관함에 추가돼요" 
      : "상대방과 함께 보도록 보관함에 추가돼요";

    return (
      <BottomSheet
        isOpen={(staging.drafts.length > 0 || staging.isReading) && !editing.isEditing && !isCommitting && !isCanceling}
        header={{
          title: `${LIBRARY_SHELF_LABELS[shelf]} 추가`,
          description,
        }}
        onClose={cancel}
      >
        <div className="space-y-md">
          <MediaTray
            drafts={staging.drafts}
            pendingCount={staging.pendingCount}
            onEdit={editing.open}
            onRemove={staging.remove}
          />
          {/* INFO: § 18. #1. One control, because there is one outcome: a row reaches 보관함 by hanging off a live message, so an upload that is not posted lands nowhere at all. */}
          {/* WARN: Held while a trim is being read back. The trimmer is already gone by then, so an upload started in that window would ship the untrimmed original and the `replace` behind it would land on a draft `takeAll` had removed. */}
          <Button disabled={isHeld} haptic onClick={() => void start()}>
            {uploadMode === true && <Lock className="size-4" strokeWidth={2.5} />}
            {uploadMode === true ? "나에게만 보내기" : uploadMode === false ? "대화방에 공유하기" : "대화에 보내기"}
          </Button>
        </div>
      </BottomSheet>
    );
  }

  function renderEditors() {
    return (
      <>
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
      </>
    );
  }

  // INFO: The draft is bound here rather than read back inside the callback — `applyTrim` clears `editing.trimming`, so a callback reading it again would be handed `null`.
  function renderTrimmer(source: MediaDraft) {
    return (
      // INFO: No `maxDurationMs` — a 보관함 attachment has no length cap (§ 9.), so both handles move.
      <VideoTrimmer
        key={source.id}
        draft={source}
        onCancel={editing.close}
        onDone={(file) => void editing.applyTrim(source, file)}
      />
    );
  }

  function hasEditableDraft() {
    return staging.drafts.some((draft) => isAllowedMediaMime(draft.mime));
  }

  function cancel() {
    if (isCommitting || isCanceling) return;
    setIsCanceling(true);
    
    // INFO: Delay clearing the drafts so the sheet has content to maintain its height while animating out.
    setTimeout(() => {
      staging.clear();
      editing.close();
      setIsCanceling(false);
    }, 400);
  }

  /**
   * WARN: `takeAll`, not a read of `staging.drafts`. It empties the tray without
   * revoking the previews, and `upload` revokes each one as it settles — leaving the
   * hook to revoke them on unmount instead would kill the blob mid-upload.
   */
  async function start() {
    if (isCommitting) return;
    setIsCommitting(true);

    // INFO: Delay taking the drafts so the sheet has content to maintain its height while animating out.
    setTimeout(async () => {
      const drafts = staging.takeAll();
      editing.close();
      setIsCommitting(false);

      if (drafts.length > 0) {
        await upload(drafts);
      }
    }, 400);
  }
}
