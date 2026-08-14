"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import {
  EMOTICON_IMAGE_EDIT_OPTIONS,
  MediaEditor,
  useMediaPicker,
} from "@/features/upload-media/@x/author-emoticon";
import {
  ALLOWED_EMOTICON_AUDIO_MIMES,
  toEmoticonAssetUrl,
  type EmoticonImageSlot,
  type EmoticonSlot,
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
import { createEmoticon, updateEmoticon, type EmoticonImageBody } from "../api/write-emoticon";
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
 * REQUIREMENTS.md § 13.4. Two image slots of which **either one alone is enough**,
 * and an optional sound. The same sheet edits an existing item, where every slot
 * left untouched keeps what the item already carries.
 *
 * WARN: A file goes in the slot its own bytes put it in, and a row refuses one that
 * belongs in the other (`useEmoticonDraft`). The alternative — filing it wherever it
 * really belongs — leaves the row the user tapped still empty and says nothing.
 *
 * WARN: Only the still reaches `MediaEditor`. A canvas crop decodes one frame and
 * re-encodes a still, which would turn an animation into a picture (§ 13.4.).
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
  // INFO: REQUIREMENTS.md § 13.4. Each slot opens its own picker directly — none of them has a second kind of file to offer a choice between.
  const stillPicker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void draft.pickImage(files[0], "still-image"),
  });
  const animatedPicker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void draft.pickImage(files[0], "animated-image"),
  });
  const audioPicker = useMediaPicker({
    accept: AUDIO_ACCEPT,
    onSelect: (files) => files[0] && draft.pickAudio(files[0]),
  });
  const stillUrl =
    draft.still?.previewUrl ?? toExistingImageUrl(emoticon, "still-image", draft.isStillCleared);
  const animatedUrl =
    draft.animated?.previewUrl ??
    toExistingImageUrl(emoticon, "animated-image", draft.isAnimatedCleared);
  const audioUrl = draft.audio?.previewUrl ?? toExistingAudioUrl(emoticon, draft.isAudioCleared);
  const hasKeywordChange = !isSameKeywords(draft.keywords, emoticon?.keywords ?? []);
  const hasChange =
    draft.still !== null ||
    draft.animated !== null ||
    draft.audio !== null ||
    draft.isStillCleared ||
    draft.isAnimatedCleared ||
    draft.isAudioCleared ||
    hasKeywordChange;
  // INFO: `emoticon_items_has_image_check`, read off what the two rows are showing — either image satisfies it, and emptying the last one is what the button refuses.
  const hasImage = stillUrl !== undefined || animatedUrl !== undefined;
  const canSubmit = !isSubmitting && hasChange && hasImage;

  // INFO: The pack screen picks a file before this opens (§ 13.4.), and it is read into whichever slot it belongs in rather than a slot the screen had to guess.
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
          {/* INFO: The one thing a reader cannot infer from two empty boxes — the CHECK takes either, so neither row may read as required. */}
          <p className="text-body-sm text-meta">둘 중 하나만 올려도 돼요</p>
          <ImageRow
            label="정지 이미지"
            hint="목록과 답장 미리보기에 쓰여요"
            previewUrl={stillUrl}
            isReading={draft.isReading}
            onPick={stillPicker.open}
            onClear={stillUrl ? () => draft.clearImage("still-image") : undefined}
            onEdit={draft.still ? () => setIsEditing(true) : undefined}
          />
          <ImageRow
            label="움직이는 이미지"
            hint="말풍선에서 재생돼요"
            previewUrl={animatedUrl}
            isReading={draft.isReading}
            onPick={animatedPicker.open}
            onClear={animatedUrl ? () => draft.clearImage("animated-image") : undefined}
          />
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
      {stillPicker.input}
      {animatedPicker.input}
      {audioPicker.input}
      {isEditing && draft.still && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a replaced image must be a second mount.
        <MediaEditor
          key={draft.still.id}
          draft={draft.still}
          editOptions={EMOTICON_IMAGE_EDIT_OPTIONS}
          onDone={(edited) => {
            draft.replaceStill(edited);
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
        "still-image": draft.still?.file,
        "animated-image": draft.animated?.file,
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
    const still = toImageBody(draft.still, keys.stillKey);
    const animated = toImageBody(draft.animated, keys.animatedKey);

    if (!still && !animated) {
      throw new Error("emoticon image missing");
    }

    return createEmoticon(packId, {
      ...(still ? { still } : {}),
      ...(animated ? { animated } : {}),
      audioKey: keys.audioKey,
      keywords: draft.keywords,
    });
  }

  /** INFO: § 13.4. An untouched slot is left out of the body entirely, so the item keeps what it has; a slot the user emptied is an explicit `null`. */
  async function saveEdit(target: Emoticon, keys: SlotKeys) {
    return updateEmoticon(target.id, {
      ...toImageEdit(
        "still",
        toImageBody(draft.still, keys.stillKey),
        draft.isStillCleared,
        target.hasStill,
      ),
      ...toImageEdit(
        "animated",
        toImageBody(draft.animated, keys.animatedKey),
        draft.isAnimatedCleared,
        target.hasAnimated,
      ),
      ...(keys.audioKey ? { audioKey: keys.audioKey } : {}),
      ...(draft.isAudioCleared && !keys.audioKey ? { audioKey: null } : {}),
      // INFO: § 13.8. Sent only when it actually changed, so an image-only edit leaves the column untouched rather than rewriting it to the same value.
      ...(hasKeywordChange ? { keywords: draft.keywords } : {}),
    });
  }

  /** INFO: A slot the item held and the user emptied is an explicit `null`; one they never touched is left out entirely. */
  function toImageEdit(
    field: "still" | "animated",
    body: Nullable<EmoticonImageBody>,
    isCleared: boolean,
    had: boolean,
  ) {
    if (body) {
      return { [field]: body };
    }

    return isCleared && had ? { [field]: null } : {};
  }
}

function toImageBody(draft: Nullable<MediaDraft>, key: Maybe<string>): Nullable<EmoticonImageBody> {
  return draft && key ? { key, width: draft.width, height: draft.height } : null;
}

/** INFO: § 13.8. Order is part of the value — the chips render in the order they were entered, so a reorder is a change worth saving. */
function isSameKeywords(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
}

type SlotFiles = Partial<Record<EmoticonSlot, Optional<Blob>>>;

type SlotKeys = {
  stillKey: Maybe<string>;
  animatedKey: Maybe<string>;
  audioKey: Maybe<string>;
};

/**
 * WARN: `allSettled`, not `all`. A rejected sibling would leave `all` resolving
 * while the others were still uploading, and the keys they land as would never be
 * known to anyone — `uploaded` is what makes them deletable.
 */
async function uploadSlots(uploaded: string[], files: SlotFiles): Promise<SlotKeys> {
  const slots = ["still-image", "animated-image", "audio"] as const;
  const results = await Promise.allSettled(
    slots.map((slot) => {
      const file = files[slot];

      return file ? uploadEmoticonAsset(slot, file) : null;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      uploaded.push(result.value);
    }
  }

  if (results.some((result) => result.status !== "fulfilled")) {
    throw new Error("emoticon asset upload failed");
  }

  const [still, animated, audio] = results.map((result) =>
    result.status === "fulfilled" ? result.value : null,
  );

  return { stillKey: still, animatedKey: animated, audioKey: audio };
}

/** INFO: Asks for the slot itself rather than letting the route fall back, so an empty row stays empty instead of showing the other slot's picture. */
function toExistingImageUrl(
  emoticon: Maybe<Emoticon>,
  slot: EmoticonImageSlot,
  isCleared: boolean,
): Optional<string> {
  const has = slot === "still-image" ? emoticon?.hasStill : emoticon?.hasAnimated;

  return emoticon && has && !isCleared
    ? toEmoticonAssetUrl(emoticon.id, slot, emoticon.version)
    : undefined;
}

function toExistingAudioLabel(emoticon: Maybe<Emoticon>, isCleared: boolean): Optional<string> {
  return emoticon?.hasAudio && !isCleared ? "등록된 소리" : undefined;
}

function toExistingAudioUrl(emoticon: Maybe<Emoticon>, isCleared: boolean): Optional<string> {
  return emoticon?.hasAudio && !isCleared
    ? toEmoticonAssetUrl(emoticon.id, "audio", emoticon.version)
    : undefined;
}

type ImageRowProps = {
  className?: string;
  label: string;
  hint: string;
  previewUrl?: string;
  isReading: boolean;
  onPick: () => void;
  onEdit?: () => void;
  onClear?: () => void;
};

function ImageRow({
  className,
  label,
  hint,
  previewUrl,
  isReading,
  onPick,
  onEdit,
  onClear,
}: ImageRowProps) {
  return (
    <div className={cn("flex items-center gap-sm", className)}>
      <HapticTarget className="inline-flex shrink-0">
        <button
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline-strong bg-surface-soft text-meta group-active:bg-surface-pressed hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
          type="button"
          aria-label={`${label} 선택`}
          onClick={onPick}
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
        <p className="text-title-sm text-ink">{label}</p>
        <p className="text-body-sm text-meta">{isReading ? "읽는 중이에요" : hint}</p>
        {(onEdit || onClear) && (
          <div className="flex items-center gap-2xs">
            {onEdit && (
              <Button
                className="w-auto"
                buttonClassName="h-9 min-h-9 w-auto px-sm"
                variant="secondary"
                haptic
                onClick={onEdit}
              >
                <Pencil className="size-4" strokeWidth={1.75} />
                편집
              </Button>
            )}
            {onClear && (
              <IconButton Icon={X} haptic aria-label={`${label} 제거`} onClick={onClear} />
            )}
          </div>
        )}
      </div>
    </div>
  );
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
