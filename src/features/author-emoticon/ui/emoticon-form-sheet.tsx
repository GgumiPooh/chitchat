"use client";

import type { Emoticon } from "@/entities/emoticon";
import {
  EMOTICON_STILL_EDIT_OPTIONS,
  MediaEditor,
  MediaPickerSheet,
} from "@/features/upload-media/@x/author-emoticon";
import { ALLOWED_EMOTICON_ANIMATED_MIMES, ALLOWED_EMOTICON_AUDIO_MIMES } from "@/shared/config";
import { cn, type Nullable, type Optional } from "@/shared/lib";
import { BottomSheet, Button, IconButton, toast } from "@/shared/ui";
import { ImagePlus, Music, Pencil, Play, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon } from "../api/write-emoticon";
import { useEmoticonDraft } from "../model/use-emoticon-draft";

const ANIMATED_ACCEPT = ALLOWED_EMOTICON_ANIMATED_MIMES.join(",");

const AUDIO_ACCEPT = ALLOWED_EMOTICON_AUDIO_MIMES.join(",");

export type EmoticonFormSheetProps = {
  className?: string;
  packId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (emoticon: Emoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.4. A still is the whole requirement; the animation and the
 * audio are optional and independent.
 *
 * WARN: The animated asset never reaches `MediaEditor`. A canvas crop decodes one
 * frame and re-encodes a still, which would silently turn the animation the user
 * picked into a picture.
 */
export function EmoticonFormSheet({
  className,
  packId,
  isOpen,
  onClose,
  onCreated,
}: EmoticonFormSheetProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const animatedRef = useRef<Nullable<HTMLInputElement>>(null);
  const audioRef = useRef<Nullable<HTMLInputElement>>(null);
  const draft = useEmoticonDraft();
  const canSubmit = draft.still !== null && !isSubmitting;

  return (
    <>
      {/* WARN: Closed while the editor is up. `MediaEditor` portals into the app shell (`ShellOverlay`) and the drawer portals into `body`, so no z-index inside the shell can put the editor over it. */}
      <BottomSheet
        className={className}
        isOpen={isOpen && !isEditing}
        header={{ title: "이모티콘 추가" }}
        onClose={handleClose}
      >
        <div className="space-y-sm pt-2xs">
          <div className="flex items-center gap-sm">
            <button
              className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline-strong bg-surface-soft text-meta hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
              type="button"
              aria-label="이모티콘 이미지 선택"
              onClick={() => setIsPickerOpen(true)}
            >
              {draft.still ? (
                // eslint-disable-next-line @next/next/no-img-element -- A local blob preview; there is no remote source for `next/image` to optimize.
                <img className="size-full object-contain" src={draft.still.previewUrl} alt="" />
              ) : (
                <ImagePlus className="size-6" strokeWidth={1.75} />
              )}
            </button>
            <div className="min-w-0 flex-1 space-y-2xs">
              <p className="text-title-sm text-ink">이미지</p>
              <p className="text-body-sm text-meta">
                {draft.isReading ? "읽는 중이에요" : "필수 · 정지 이미지"}
              </p>
              {draft.still && (
                <Button
                  className="h-9 w-auto px-sm"
                  variant="secondary"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-4" strokeWidth={1.75} />
                  편집
                </Button>
              )}
            </div>
          </div>
          <CompanionRow
            label="움직이는 이미지"
            hint="선택 · webp 또는 gif"
            Icon={Play}
            fileName={draft.animated?.file.name}
            onPick={() => animatedRef.current?.click()}
            onClear={() => draft.clearCompanion("animated")}
          />
          <CompanionRow
            label="소리"
            hint="선택 · 탭할 때만 재생돼요"
            Icon={Music}
            fileName={draft.audio?.file.name}
            onPick={() => audioRef.current?.click()}
            onClear={() => draft.clearCompanion("audio")}
          />
          <Button disabled={!canSubmit} onClick={() => void submit()}>
            {isSubmitting ? "올리는 중이에요" : "추가"}
          </Button>
        </div>
      </BottomSheet>
      <MediaPickerSheet
        accept="image/*"
        isOpen={isPickerOpen}
        isMultiple={false}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(files) => files[0] && void draft.pickStill(files[0])}
      />
      {isEditing && draft.still && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a replaced image must be a second mount.
        <MediaEditor
          key={draft.still.id}
          draft={draft.still}
          editOptions={EMOTICON_STILL_EDIT_OPTIONS}
          onDone={(edited) => {
            draft.replaceStill(edited);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}
      <input
        ref={animatedRef}
        className="hidden"
        type="file"
        accept={ANIMATED_ACCEPT}
        onChange={(event) => handlePick(event, "animated")}
      />
      <input
        ref={audioRef}
        className="hidden"
        type="file"
        accept={AUDIO_ACCEPT}
        onChange={(event) => handlePick(event, "audio")}
      />
    </>
  );

  function handlePick(event: ChangeEvent<HTMLInputElement>, slot: "animated" | "audio") {
    const file = event.target.files?.[0];

    // WARN: Cleared so picking the same file twice still fires `change`; the value survives the selection otherwise and the second pick is silent.
    event.target.value = "";

    if (file) {
      draft.pickCompanion(slot, file);
    }
  }

  function handleClose() {
    draft.reset();
    onClose();
  }

  async function submit() {
    if (!draft.still) {
      return;
    }

    setIsSubmitting(true);

    // INFO: Every key that reached R2, whether or not the submit went on to succeed — the failure path has to name them to get them back out.
    const uploaded: string[] = [];

    try {
      // INFO: REQUIREMENTS.md § 13.4. Every slot uploads on submit, never on pick, so an abandoned form leaves nothing in the bucket.
      const keys = await uploadSlots(uploaded, {
        still: draft.still.file,
        animated: draft.animated?.file,
        audio: draft.audio?.file,
      });

      onCreated(
        await createEmoticon(packId, {
          ...keys,
          width: draft.still.width,
          height: draft.still.height,
        }),
      );

      handleClose();
    } catch {
      // INFO: A slot that landed before its sibling failed — or before a 422 from registration — is referenced by nothing, and nothing in the app addresses R2 by key, so it is unreachable until it is deleted.
      void discardEmoticonAssets(uploaded);
      toast.error("이모티콘을 추가하지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }
}

type SlotFiles = {
  still: Blob;
  animated: Optional<Blob>;
  audio: Optional<Blob>;
};

/**
 * WARN: `allSettled`, not `all`. A rejected sibling would leave `all` resolving
 * while the other slots were still uploading, and the keys they land as would
 * never be known to anyone — `uploaded` is what makes them deletable.
 */
async function uploadSlots(uploaded: string[], files: SlotFiles) {
  const results = await Promise.allSettled([
    uploadEmoticonAsset("still", files.still),
    files.animated ? uploadEmoticonAsset("animated", files.animated) : null,
    files.audio ? uploadEmoticonAsset("audio", files.audio) : null,
  ]);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      uploaded.push(result.value);
    }
  }

  const [still, animated, audio] = results;

  if (
    still.status !== "fulfilled" ||
    animated.status !== "fulfilled" ||
    audio.status !== "fulfilled"
  ) {
    throw new Error("emoticon asset upload failed");
  }

  return { stillKey: still.value, animatedKey: animated.value, audioKey: audio.value };
}

type CompanionRowProps = {
  className?: string;
  label: string;
  hint: string;
  Icon: typeof Play;
  fileName?: string;
  onPick: () => void;
  onClear: () => void;
};

function CompanionRow({
  className,
  label,
  hint,
  Icon,
  fileName,
  onPick,
  onClear,
}: CompanionRowProps) {
  return (
    <div className={cn("flex items-center gap-sm rounded-md bg-surface-soft p-sm", className)}>
      <Icon className="size-5 shrink-0 text-meta" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-title-sm text-ink">{label}</p>
        <p className="truncate text-body-sm text-meta">{fileName ?? hint}</p>
      </div>
      {fileName ? (
        <IconButton Icon={X} aria-label={`${label} 제거`} onClick={onClear} />
      ) : (
        <Button className="h-9 w-auto px-sm" variant="secondary" onClick={onPick}>
          선택
        </Button>
      )}
    </div>
  );
}
