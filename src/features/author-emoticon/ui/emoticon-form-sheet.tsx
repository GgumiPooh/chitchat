"use client";

import type { Emoticon } from "@/entities/emoticon";
import {
  EMOTICON_IMAGE_EDIT_OPTIONS,
  MediaEditor,
  useMediaPicker,
} from "@/features/upload-media/@x/author-emoticon";
import {
  ALLOWED_EMOTICON_AUDIO_MIMES,
  isAnimatableEmoticonMime,
  toEmoticonAssetUrl,
} from "@/shared/config";
import {
  cn,
  playSound,
  stopSound,
  type EmoticonPackId,
  type Maybe,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import {
  BottomSheet,
  Button,
  HapticTarget,
  IconButton,
  KeywordField,
  PreloadImage,
  toast,
} from "@/shared/ui";
import { ImagePlus, Music, Pencil, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon, updateEmoticon } from "../api/write-emoticon";
import { useEmoticonDraft } from "../model/use-emoticon-draft";

const AUDIO_ACCEPT = ALLOWED_EMOTICON_AUDIO_MIMES.join(",");

export type EmoticonFormSheetProps = {
  className?: string;
  packId: EmoticonPackId;
  isOpen: boolean;
  /** REQUIREMENTS.md § 13.4. The item being edited; absent authors a new one. */
  emoticon?: Nullable<Emoticon>;
  /** INFO: A pick made on the screen behind the sheet — the pack screen picks first, so one image opens this form already staged. */
  initialFile?: Nullable<File>;
  onClose: () => void;
  onSaved: (emoticon: Emoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.4. One image is the whole requirement, animated or not, and
 * the sound is optional. The same sheet edits an existing item, where every slot
 * left untouched keeps what the item already carries.
 *
 * WARN: A file that may animate never reaches `MediaEditor`. A canvas crop decodes
 * one frame and re-encodes a still, which would silently turn the animation the
 * user picked into a picture — so the crop control is offered for re-encoded
 * images only (§ 13.4.).
 */
export function EmoticonFormSheet({
  className,
  packId,
  isOpen,
  emoticon,
  initialFile,
  onClose,
  onSaved,
}: EmoticonFormSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const draft = useEmoticonDraft();
  const { pickImage, setKeywords } = draft;
  // INFO: REQUIREMENTS.md § 13.4. An item is one image and one sound, so each slot opens its own picker directly — neither has a second kind of file to offer a choice between.
  const imagePicker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void draft.pickImage(files[0]),
  });
  const audioPicker = useMediaPicker({
    accept: AUDIO_ACCEPT,
    onSelect: (files) => files[0] && draft.pickAudio(files[0]),
  });
  const previewUrl = draft.image?.previewUrl ?? toExistingImageUrl(emoticon);
  const audioUrl = draft.audio?.previewUrl ?? toExistingAudioUrl(emoticon, draft.isAudioCleared);
  const isCroppable = draft.image !== null && !isAnimatableEmoticonMime(draft.image.mime);
  const hasKeywordChange = !isSameKeywords(draft.keywords, emoticon?.keywords ?? []);
  const hasChange =
    draft.image !== null || draft.audio !== null || draft.isAudioCleared || hasKeywordChange;
  const canSubmit = !isSubmitting && hasChange && (emoticon != null || draft.image !== null);

  // INFO: The pack screen picks the image before this opens (§ 13.4.), so the file it holds is staged as though the sheet's own picker had produced it.
  useEffect(() => {
    if (isOpen && initialFile) {
      void pickImage(initialFile);
    }
  }, [isOpen, initialFile, pickImage]);

  // WARN: § 13.8. The sheet stays mounted between items, so the list has to be re-seeded on every open — without this, editing a second item shows the first one's keywords.
  // WARN: Keyed on the item's **id**, never the object. The pack screen rebuilds item objects on every save, so an identity dependency re-seeded the field from the server mid-edit and discarded chips the user had just typed.
  useEffect(() => {
    if (isOpen) {
      setKeywords(emoticon?.keywords ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, emoticon?.id, setKeywords]);

  return (
    <>
      {/* WARN: Closed while the editor is up. `MediaEditor` portals into the app shell (`ShellOverlay`) and the drawer portals into `body`, so no z-index inside the shell can put the editor over it. */}
      <BottomSheet
        className={className}
        isOpen={isOpen && !isEditing}
        header={{ title: emoticon ? "이모티콘 편집" : "이모티콘 추가" }}
        onClose={handleClose}
      >
        <div className="space-y-sm pt-2xs">
          <div className="flex items-center gap-sm">
            <HapticTarget className="inline-flex shrink-0">
              <button
                className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline-strong bg-surface-soft text-meta group-active:bg-surface-pressed hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
                type="button"
                aria-label="이모티콘 이미지 선택"
                onClick={imagePicker.open}
              >
                {previewUrl ? (
                  <PreloadImage
                    className="size-full"
                    imgClassName="size-full object-contain"
                    src={previewUrl}
                    alt=""
                  />
                ) : (
                  <ImagePlus className="size-6" strokeWidth={1.75} />
                )}
              </button>
            </HapticTarget>
            <div className="min-w-0 flex-1 space-y-2xs">
              <p className="text-title-sm text-ink">이미지</p>
              <p className="text-body-sm text-meta">
                {draft.isReading ? "읽는 중이에요" : "필수 · 움직이는 이미지도 괜찮아요"}
              </p>
              {isCroppable && (
                <Button
                  className="w-auto"
                  buttonClassName="h-9 min-h-9 w-auto px-sm"
                  variant="secondary"
                  haptic
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-4" strokeWidth={1.75} />
                  편집
                </Button>
              )}
            </div>
          </div>
          <AudioRow
            fileName={
              draft.audio?.file.name ?? toExistingAudioLabel(emoticon, draft.isAudioCleared)
            }
            onPlay={playAudio}
            onPick={audioPicker.open}
            onClear={draft.clearAudio}
          />
          <KeywordField
            className="rounded-md bg-surface-soft p-sm"
            keywords={draft.keywords}
            isDisabled={isSubmitting}
            onChange={draft.setKeywords}
          />
          <Button disabled={!canSubmit} haptic onClick={() => void submit()}>
            {isSubmitting ? "올리는 중이에요" : emoticon ? "저장" : "추가"}
          </Button>
        </div>
      </BottomSheet>
      {imagePicker.input}
      {audioPicker.input}
      {isEditing && draft.image && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a replaced image must be a second mount.
        <MediaEditor
          key={draft.image.id}
          draft={draft.image}
          editOptions={EMOTICON_IMAGE_EDIT_OPTIONS}
          onDone={(edited) => {
            draft.replaceImage(edited);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </>
  );

  /** INFO: The picked file plays off its object URL and a kept one off R2, so the button auditions whatever the submit would actually save. */
  function playAudio() {
    if (audioUrl) {
      // WARN: Synchronously inside the click, like the § 13.6. bubble — iOS grants the gesture's audio permission to this call stack alone.
      playSound(audioUrl);
    }
  }

  function handleClose() {
    // WARN: Before `reset`, which revokes the object URL an audition still in progress is sourcing — the shared player would be left pointing at a dead blob.
    stopSound();
    draft.reset();
    onClose();
  }

  async function submit() {
    setIsSubmitting(true);

    // INFO: Every key that reached R2, whether or not the submit went on to succeed — the failure path has to name them to get them back out.
    const uploaded: string[] = [];

    try {
      // INFO: REQUIREMENTS.md § 13.4. Every slot uploads on submit, never on pick, so an abandoned form leaves nothing in the bucket.
      const keys = await uploadSlots(uploaded, {
        image: draft.image?.file,
        audio: draft.audio?.file,
      });

      onSaved(emoticon ? await saveEdit(emoticon, keys) : await saveNew(keys));
      handleClose();
    } catch {
      // INFO: A slot that landed before its sibling failed — or before a 422 from the write — is referenced by nothing, and nothing in the app addresses R2 by key, so it is unreachable until it is deleted.
      void discardEmoticonAssets(uploaded);
      toast.error(emoticon ? "이모티콘을 수정하지 못했어요" : "이모티콘을 추가하지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveNew(keys: SlotKeys) {
    if (!draft.image || !keys.imageKey) {
      throw new Error("emoticon image missing");
    }

    return createEmoticon(packId, {
      imageKey: keys.imageKey,
      width: draft.image.width,
      height: draft.image.height,
      audioKey: keys.audioKey,
      keywords: draft.keywords,
    });
  }

  /** INFO: § 13.4. An untouched slot is left out of the body entirely, so the item keeps what it has; a cleared sound is an explicit `null`. */
  async function saveEdit(target: Emoticon, keys: SlotKeys) {
    return updateEmoticon(target.id, {
      ...(draft.image && keys.imageKey
        ? { imageKey: keys.imageKey, width: draft.image.width, height: draft.image.height }
        : {}),
      ...(keys.audioKey ? { audioKey: keys.audioKey } : {}),
      ...(draft.isAudioCleared && !keys.audioKey ? { audioKey: null } : {}),
      // INFO: § 13.8. Sent only when it actually changed, so an image-only edit leaves the column untouched rather than rewriting it to the same value.
      ...(hasKeywordChange ? { keywords: draft.keywords } : {}),
    });
  }
}

/** INFO: § 13.8. Order is part of the value — the chips render in the order they were entered, so a reorder is a change worth saving. */
function isSameKeywords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
}

type SlotFiles = {
  image: Optional<Blob>;
  audio: Optional<Blob>;
};

type SlotKeys = {
  imageKey: Maybe<string>;
  audioKey: Maybe<string>;
};

/**
 * WARN: `allSettled`, not `all`. A rejected sibling would leave `all` resolving
 * while the other slot was still uploading, and the key it lands as would never be
 * known to anyone — `uploaded` is what makes it deletable.
 */
async function uploadSlots(uploaded: string[], files: SlotFiles): Promise<SlotKeys> {
  const results = await Promise.allSettled([
    files.image ? uploadEmoticonAsset("image", files.image) : null,
    files.audio ? uploadEmoticonAsset("audio", files.audio) : null,
  ]);

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      uploaded.push(result.value);
    }
  }

  const [image, audio] = results;

  if (image.status !== "fulfilled" || audio.status !== "fulfilled") {
    throw new Error("emoticon asset upload failed");
  }

  return { imageKey: image.value, audioKey: audio.value };
}

function toExistingImageUrl(emoticon: Maybe<Emoticon>): Optional<string> {
  return emoticon ? toEmoticonAssetUrl(emoticon.id, "image", emoticon.version) : undefined;
}

function toExistingAudioLabel(emoticon: Maybe<Emoticon>, isCleared: boolean): Optional<string> {
  return emoticon?.hasAudio && !isCleared ? "등록된 소리" : undefined;
}

function toExistingAudioUrl(emoticon: Maybe<Emoticon>, isCleared: boolean): Optional<string> {
  return emoticon?.hasAudio && !isCleared
    ? toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version)
    : undefined;
}

type AudioRowProps = {
  className?: string;
  fileName?: string;
  onPlay: () => void;
  onPick: () => void;
  onClear: () => void;
};

function AudioRow({ className, fileName, onPlay, onPick, onClear }: AudioRowProps) {
  return (
    <div className={cn("flex items-center gap-sm rounded-md bg-surface-soft p-sm", className)}>
      <Music className="size-5 shrink-0 text-meta" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-title-sm text-ink">소리</p>
        <p className="truncate text-body-sm text-meta">{fileName ?? "선택 · 탭할 때만 재생돼요"}</p>
      </div>
      {fileName ? (
        <>
          <IconButton Icon={Play} haptic aria-label="소리 듣기" onClick={onPlay} />
          <IconButton Icon={X} haptic aria-label="소리 제거" onClick={onClear} />
        </>
      ) : (
        <Button
          className="w-auto"
          buttonClassName="h-9 min-h-9 w-auto px-sm"
          variant="secondary"
          haptic
          onClick={onPick}
        >
          선택
        </Button>
      )}
    </div>
  );
}
