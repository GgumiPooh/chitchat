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
import { isAllowedMediaMime, LIBRARY_KIND_LABELS, type LibraryKind } from "@/shared/config";
import { BottomSheet, Button, ShellOverlay } from "@/shared/ui";
import { useArchiveUpload } from "./use-archive-upload";

export type ShelfStagingParams = {
  /** Which shelf this is running on — it picks the sheet's title and decides which uploads report themselves as having landed elsewhere. */
  kind: LibraryKind;
  /**
   * Whether a § 9.1. file attachment may be staged.
   *
   * INFO: 사진 says no and the other two say yes. The 사진 shelf shows tiles and a
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
 * a drop target, the tray it fills, the two editors, and the
 * `대화에도 보내기` / `보관함에만 추가` pair under it.
 *
 * INFO: A shared hook rather than three copies, and the `isEnabled` predicate below
 * is the reason. § 9.2. makes it an invariant that a drop is refused for the length
 * of a selection and under an editor or the viewer; written out per screen it would
 * drift, and the shelf that drifted would be the one that uploads into a grid its
 * selection bar is about to delete from.
 *
 * INFO: It returns nodes as well as state, the way `useSetBackground` does — a shelf
 * wires the whole flow with a spread of `dropHandlers` and three slots, which is what
 * keeps the three screens from each growing their own copy of the sheet.
 */
export function useShelfStaging({ kind, acceptsFiles, isBlocked, onAdded }: ShelfStagingParams) {
  const staging = useMediaSelection({ acceptsFiles });
  const editing = useAttachmentEditing(staging.replace);
  const { remainingCount, isBusy, upload } = useArchiveUpload(kind, onAdded);
  // WARN: REQUIREMENTS.md § 9.2. Refused under an editor as well as behind `isBlocked`. React bubbles a drop through the *component* tree, so `MediaEditor` and `VideoTrimmer` deliver one here however they are portalled — and the sheet is suppressed for exactly their duration, so the drop would land in a tray the user cannot see.
  const drop = useFileDrop({
    isEnabled: !isBlocked && !editing.isEditing,
    onDrop: (files) => void staging.add(files),
  });
  const isHeld = staging.drafts.length === 0 || staging.isReading || editing.isApplying;

  return {
    dropHandlers: drop.handlers,
    remainingCount,
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
   * room's. A shelf *is* the shell scroller's content, so an `absolute inset-0`
   * overlay left inside it spans every month ever loaded and centres its label far
   * below the fold — and going `fixed` to reach the visible box is what
   * AGENTS.md § 4.4. rules out.
   */
  function renderOverlay() {
    return (
      <ShellOverlay>
        <FileDropOverlay isActive={drop.isDropping} label="여기에 놓으면 추가돼요" />
      </ShellOverlay>
    );
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
    return (
      <BottomSheet
        isOpen={(staging.drafts.length > 0 || staging.isReading) && !editing.isEditing}
        header={{
          title: `${LIBRARY_KIND_LABELS[kind]} 추가`,
          // INFO: Only said where it is true. A file has neither editor (§ 9.1.), so the line appears once the tray actually holds something a tap could crop or trim.
          description: hasEditableDraft() ? "올리기 전에 하나씩 편집할 수 있어요" : undefined,
        }}
        onClose={cancel}
      >
        <div className="space-y-md">
          <MediaTray
            drafts={staging.drafts}
            isReading={staging.isReading}
            onEdit={editing.open}
            onRemove={staging.remove}
          />
          {/* INFO: REQUIREMENTS.md § 10. 보관함 is the shared album, so posting to the conversation is the default and not posting is the option beside it. Both rows are on every shelf: `registerMedia` used to refuse `addToGallery` for a file and a recording, and it no longer does (§ 9.1., § 9.3.). */}
          {/* WARN: Both are held while a trim is being read back. The trimmer is already gone by then, so an upload started in that window would ship the untrimmed original and the `replace` behind it would land on a draft `takeAll` had removed. */}
          <div className="space-y-xs">
            <Button disabled={isHeld} haptic onClick={() => void start({ shouldPost: true })}>
              대화에도 보내기
            </Button>
            <Button
              variant="secondary"
              disabled={isHeld}
              haptic
              onClick={() => void start({ shouldPost: false })}
            >
              보관함에만 추가
            </Button>
          </div>
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
    staging.clear();
    editing.close();
  }

  /**
   * WARN: `takeAll`, not a read of `staging.drafts`. It empties the tray without
   * revoking the previews, and `upload` revokes each one as it settles — leaving the
   * hook to revoke them on unmount instead would kill the blob mid-upload.
   */
  async function start({ shouldPost }: { shouldPost: boolean }) {
    const drafts = staging.takeAll();

    editing.close();

    if (drafts.length > 0) {
      await upload(drafts, { shouldPost });
    }
  }
}
