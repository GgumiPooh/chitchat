"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import {
  CutoutEditor,
  EMOTICON_IMAGE_EDIT_OPTIONS,
  MediaEditor,
  releaseCutoutWorker,
  useMediaPicker,
  VoiceRecorderBar,
  type VoiceRecording,
} from "@/features/upload-media/@x/author-emoticon";
import {
  ALLOWED_EMOTICON_AUDIO_MIMES,
  EMOTICON_KIND_NOUNS,
  toEmoticonAssetUrl,
  type EmoticonPackType,
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
import { josa } from "es-hangul";
import { Film, Image as ImageIcon, ImagePlus, Mic, Music, Pencil, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon, updateEmoticon, type EmoticonImageBody } from "../api/write-emoticon";
import { useEmoticonDraft } from "../model/use-emoticon-draft";
import { useVideoEmoticon, type VideoEmoticon } from "../model/use-video-emoticon";

const AUDIO_ACCEPT = ALLOWED_EMOTICON_AUDIO_MIMES.join(",");

export type EmoticonFormSheetProps = {
  className?: string;
  packId: EmoticonPackId;
  /** REQUIREMENTS.md § 13. Which kind is being authored — it decides whether the form has a words field at all, and nothing else. */
  type: EmoticonPackType;
  isOpen: boolean;
  /** REQUIREMENTS.md § 13.4. The item being edited; absent authors a new one. */
  emoticon?: Nullable<Emoticon>;
  /** INFO: A pick made on the screen behind the sheet — the pack screen picks first, so one image opens this form already staged. */
  initialFile?: Nullable<File>;
  onClose: () => void;
  onSaved: (emoticon: Emoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.4. One image and an optional sound. The same sheet edits an
 * existing item, where every slot left untouched keeps what the item already carries.
 *
 * WARN: One field, two slots. An animated pick fills both — its own bytes and a still
 * extracted from them — and a static pick empties the animation the item was showing,
 * because that animation is not a rendering of the picture that just replaced it.
 *
 * WARN: The image has no clear button. `emoticon_items_has_image_check` forbids an item
 * with no image, so replacing is the only operation the field has.
 *
 * WARN: Only a static pick reaches `MediaEditor`. A canvas crop decodes one frame and
 * re-encodes a still, which would turn an animation into a picture (§ 13.4.).
 */
export function EmoticonFormSheet({
  className,
  packId,
  type,
  isOpen,
  emoticon,
  initialFile,
  onClose,
  onSaved,
}: EmoticonFormSheetProps) {
  const kindNoun = EMOTICON_KIND_NOUNS[type].kind;
  // INFO: § 13.4.2. A picked image walks 누끼 → 영역 자르기 on its own; the thumbnail re-enters at the crop, since the picture it would re-open on has already had its background taken off.
  const [step, setStep] = useState<Nullable<"cutout" | "crop">>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = step !== null;
  const draft = useEmoticonDraft();
  const { adoptImage, pickAudio, pickImage, setKeywords } = draft;
  // WARN: § 13.4.1. Kept beside the slots and cleared by every other pick — an animation staged from a picked GIF has no clip behind it, and re-opening the flow on the last video would edit a file the field is no longer showing.
  const [videoSource, setVideoSource] = useState<Nullable<File>>(null);
  // INFO: § 13.4.1. A clip fills the same two slots a picked animation does, so it is a second source for this one field rather than a flow of its own.
  const video = useVideoEmoticon({ onReady: stageVideo });
  // INFO: REQUIREMENTS.md § 13.4. Opens the OS picker directly (`DESIGN.md § 7.5.`) — one image is the whole of the choice, so there is nothing for a sheet to frame.
  const imagePicker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void pickPlainImage(files[0]),
  });
  const videoPicker = useMediaPicker({
    accept: "video/*",
    onSelect: (files) => files[0] && void video.open(files[0]),
  });
  const audioPicker = useMediaPicker({
    accept: AUDIO_ACCEPT,
    onSelect: (files) => files[0] && void draft.pickAudio(files[0]),
  });
  // INFO: The animation wherever there is one, so the box shows the emoticon moving rather than the frame it was reduced to.
  const imageUrl =
    draft.image?.animated?.previewUrl ??
    draft.image?.still.previewUrl ??
    toExistingImageUrl(emoticon);
  const audioUrl = draft.audio?.previewUrl ?? toExistingAudioUrl(emoticon, draft.isAudioCleared);
  const hasKeywordChange = !isSameKeywords(draft.keywords, emoticon?.keywords ?? []);
  const hasChange =
    draft.image !== null || draft.audio !== null || draft.isAudioCleared || hasKeywordChange;
  const canSubmit = !isSubmitting && hasChange && imageUrl !== undefined;

  // INFO: The pack screen picks a file before this opens (§ 13.4.), so the form is already staged when it appears.
  useEffect(() => {
    if (isOpen && initialFile) {
      void pickPlainImage(initialFile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pickPlainImage` is redeclared per render; a dependency on it would re-run the whole § 13.4.2. flow on every keystroke in the keyword field.
  }, [isOpen, initialFile]);

  // WARN: § 13.8. The sheet stays mounted between items, so the list has to be re-seeded on every open — without this, editing a second item shows the first one's keywords.
  // WARN: Keyed on the item's **id**, never the object. The pack screen rebuilds item objects on every save, so an identity dependency re-seeded the field from the server mid-edit and discarded chips the user had just typed.
  useEffect(() => {
    if (isOpen) {
      setKeywords(emoticon?.keywords ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, emoticon?.id, setKeywords]);

  // INFO: § 13.4.2. Both flows done — still or clip — is when the matting heap is worth more than the seconds a reload of the model costs.
  useEffect(() => {
    if (!isEditing && !video.isActive) {
      releaseCutoutWorker();
    }
  }, [isEditing, video.isActive]);

  return (
    <>
      {/* WARN: Closed while the editor or § 13.4.1.'s video flow is up. Both portal into the app shell (`ShellOverlay`) and the drawer portals into `body`, so no z-index inside the shell can put either over it. */}
      <BottomSheet
        className={className}
        isOpen={isOpen && !isEditing && !video.isActive}
        header={{ title: `${kindNoun} ${emoticon ? "편집" : "추가"}` }}
        onClose={handleClose}
      >
        <div className="space-y-sm pt-2xs">
          <ImageRow
            label="이미지"
            hint="움직이는 이미지도 올려도 돼요"
            previewUrl={imageUrl}
            isReading={draft.isReading}
            onPick={imagePicker.open}
            onEdit={toEdit()}
            onPickVideo={videoPicker.open}
          />
          <AudioRow
            isRecording={isRecording}
            isReading={draft.isReading}
            fileName={
              draft.audio?.file.name ?? toExistingAudioLabel(emoticon, draft.isAudioCleared)
            }
            onPlay={playAudio}
            onPick={audioPicker.open}
            onRecord={() => setIsRecording(true)}
            onRecordingDone={handleRecordingDone}
            onRecordingClose={() => setIsRecording(false)}
            onClear={draft.clearAudio}
          />
          {/* INFO: § 13. A mini carries no words — no search reaches one (§ 2.6.), so the form has nothing to offer between the sound and the button. */}
          {type !== "mini" && (
            <KeywordField
              className="rounded-md bg-surface-soft p-sm"
              keywords={draft.keywords}
              isDisabled={isSubmitting}
              onChange={draft.setKeywords}
            />
          )}
          <Button disabled={!canSubmit} haptic onClick={() => void submit()}>
            {isSubmitting ? "올리는 중이에요" : emoticon ? "저장" : "추가"}
          </Button>
        </div>
      </BottomSheet>
      {imagePicker.input}
      {videoPicker.input}
      {audioPicker.input}
      {video.overlay}
      {step === "cutout" && draft.image && (
        // WARN: Keyed by draft for `MediaEditor`'s reason — the matte is started on mount, so a replaced image must be a second one.
        <CutoutEditor
          key={draft.image.still.id}
          draft={draft.image.still}
          onDone={(cutout) => {
            if (cutout) {
              draft.replaceStill(cutout);
            }

            setStep("crop");
          }}
          onCancel={() => setStep(null)}
        />
      )}
      {step === "crop" && draft.image && (
        // WARN: Keyed by draft — `MediaEditor` mints its source object URL once per mount, so editing a replaced image must be a second mount.
        <MediaEditor
          key={draft.image.still.id}
          draft={draft.image.still}
          editOptions={EMOTICON_IMAGE_EDIT_OPTIONS}
          onDone={(edited) => {
            draft.replaceStill(edited);
            setStep(null);
          }}
          onCancel={() => setStep(null)}
        />
      )}
    </>
  );

  /**
   * What 편집 — and the thumbnail — does with what is staged, or nothing at all.
   *
   * INFO: § 13.4.1. An animation re-enters the video flow at its source clip, which
   * is the only way to cut it shorter or frame it tighter; a canvas crop would decode
   * one frame (§ 13.4.). Anything already saved, and an animation picked as a file,
   * has nothing to edit from.
   */
  function toEdit(): Optional<() => void> {
    if (!draft.image) {
      return undefined;
    }

    if (!draft.image.animated) {
      return () => setStep("crop");
    }

    return videoSource ? () => void video.open(videoSource) : undefined;
  }

  /** INFO: § 13.4.2. The pick opens the flow rather than merely staging the slots — 누끼 first, then the crop drawn against what is left of the picture. */
  async function pickPlainImage(file: File) {
    setVideoSource(null);

    const picked = await pickImage(file);

    // WARN: A static pick only. § 13.4.'s rule for `MediaEditor` covers this one too — a canvas that mattes one frame would turn an animation into a picture.
    if (picked && !picked.animated) {
      setStep("cutout");
    }
  }

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
    setVideoSource(null);
    onClose();
  }

  function handleRecordingDone(recording: VoiceRecording) {
    void draft.pickAudio(recording.file);
  }

  // INFO: § 13.4.1. The sound is never asked about — it is staged into the row below, which already auditions, replaces and removes it.
  function stageVideo({ image, audio, source }: VideoEmoticon) {
    adoptImage(image);
    setVideoSource(source);

    if (audio) {
      void pickAudio(audio);
    }
  }

  async function submit() {
    setIsSubmitting(true);

    // INFO: Every key that reached R2, whether or not the submit went on to succeed — the failure path has to name them to get them back out.
    const uploaded: string[] = [];

    try {
      // INFO: REQUIREMENTS.md § 13.4. Every slot uploads on submit, never on pick, so an abandoned form leaves nothing in the bucket.
      const keys = await uploadSlots(uploaded, {
        "still-image": draft.image?.still.file,
        "animated-image": draft.image?.animated?.file,
        audio: draft.audio?.file,
      });

      onSaved(emoticon ? await saveEdit(emoticon, keys) : await saveNew(keys));
      handleClose();
    } catch {
      // INFO: A slot that landed before its sibling failed — or before a 422 from the write — is referenced by nothing, and nothing in the app addresses R2 by key, so it is unreachable until it is deleted.
      void discardEmoticonAssets(uploaded);
      toast.error(`${josa(kindNoun, "을/를")} ${emoticon ? "수정" : "추가"}하지 못했어요`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveNew(keys: SlotKeys) {
    const still = toImageBody(draft.image?.still, keys.stillKey);

    if (!still) {
      throw new Error("emoticon image missing");
    }

    const animated = toImageBody(draft.image?.animated, keys.animatedKey);

    return createEmoticon(packId, {
      still,
      ...(animated ? { animated } : {}),
      audioKey: keys.audioKey,
      keywords: draft.keywords,
    });
  }

  /** INFO: § 13.4. An untouched slot is left out of the body entirely, so the item keeps what it has. */
  async function saveEdit(target: Emoticon, keys: SlotKeys) {
    const still = toImageBody(draft.image?.still, keys.stillKey);
    const animated = toImageBody(draft.image?.animated, keys.animatedKey);
    // INFO: A static pick has to say so. An absent slot keeps what the item has, which would leave the bubble playing an animation of the picture the still just replaced.
    const clearsAnimation = still !== null && animated === null && target.hasAnimated;

    return updateEmoticon(target.id, {
      ...(still ? { still } : {}),
      ...(animated ? { animated } : {}),
      ...(clearsAnimation ? { animated: null } : {}),
      ...(keys.audioKey ? { audioKey: keys.audioKey } : {}),
      ...(draft.isAudioCleared && !keys.audioKey ? { audioKey: null } : {}),
      // INFO: § 13.8. Sent only when it actually changed, so an image-only edit leaves the column untouched rather than rewriting it to the same value.
      ...(hasKeywordChange ? { keywords: draft.keywords } : {}),
    });
  }
}

function toImageBody(draft: Maybe<MediaDraft>, key: Maybe<string>): Nullable<EmoticonImageBody> {
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

/** INFO: The animation where the item has one, matching what a fresh pick previews — the box is showing the emoticon itself, not standing in for a picker cell. */
function toExistingImageUrl(emoticon: Maybe<Emoticon>): Optional<string> {
  return emoticon
    ? toEmoticonAssetUrl(
        emoticon.id,
        emoticon.hasAnimated ? "animated-image" : "still-image",
        emoticon.version,
      )
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

const TILE_CLASS_NAME =
  "flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline-strong bg-surface-soft text-meta";

type ImageRowProps = {
  className?: string;
  label: string;
  hint: string;
  previewUrl?: string;
  isReading: boolean;
  onPick: () => void;
  onEdit?: () => void;
  onPickVideo: () => void;
};

function ImageRow({
  className,
  label,
  hint,
  previewUrl,
  isReading,
  onPick,
  onEdit,
  onPickVideo,
}: ImageRowProps) {
  const preview = previewUrl ? (
    <PreloadImage
      className="size-full"
      imgClassName="size-full object-contain"
      src={previewUrl}
      alt=""
    />
  ) : (
    <ImageIcon className="size-6" strokeWidth={1.75} />
  );

  return (
    // WARN: `items-start`, not `items-center`. The column beside the tile wraps its two sources onto separate lines on a narrow screen, and a centred tile then hangs below the label it belongs to.
    <div className={cn("flex items-start gap-sm", className)}>
      {/* INFO: A tile is a control only where it has an edit to open — empty, it is the row's preview of a field the two buttons below fill, and a tap that re-opened the picker read as the only way in. */}
      {onEdit ? (
        <HapticTarget className="inline-flex shrink-0">
          <button
            className={cn(
              TILE_CLASS_NAME,
              "relative cursor-pointer group-active:bg-surface-pressed hover:bg-surface-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed",
            )}
            type="button"
            aria-label={`${label} 편집`}
            onClick={onEdit}
          >
            {preview}
            {/* INFO: DESIGN.md § 7.1. A `floating` surface for the same reason `IconButton` gives it one — the glyph sits over an image it cannot predict. */}
            <span className="absolute right-1 bottom-1 rounded-full border border-hairline glass p-1 text-ink shadow-floating">
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </span>
          </button>
        </HapticTarget>
      ) : (
        <div className={TILE_CLASS_NAME}>{preview}</div>
      )}
      <div className="min-w-0 flex-1 space-y-2xs">
        <p className="text-title-sm text-ink">{label}</p>
        <p className="text-body-sm text-meta">{isReading ? "읽는 중이에요" : hint}</p>
        {/* INFO: § 13.4.2. The two sources and nothing else. 편집 was a third button here and is gone: a pick now walks 누끼 → 영역 자르기 by itself, so the only edit left is the one the thumbnail opens — and a conditional button between the two sources shifted them every time an image was replaced. */}
        <div className="flex flex-wrap gap-2xs">
          <Button
            className="w-auto"
            buttonClassName="h-9 min-h-9 w-auto px-sm"
            variant="secondary"
            haptic
            onClick={onPick}
          >
            <ImagePlus className="size-4" strokeWidth={1.75} />
            이미지 업로드
          </Button>
          {/* INFO: § 13.4.1. Here rather than in the add sheet, because a clip is another way to fill this one field — not another kind of item. */}
          <Button
            className="w-auto"
            buttonClassName="h-9 min-h-9 w-auto px-sm"
            variant="secondary"
            haptic
            onClick={onPickVideo}
          >
            <Film className="size-4" strokeWidth={1.75} />
            영상에서 추출
          </Button>
        </div>
      </div>
    </div>
  );
}

type AudioRowProps = {
  className?: string;
  fileName?: string;
  isRecording: boolean;
  isReading: boolean;
  onPlay: () => void;
  onPick: () => void;
  onRecord: () => void;
  onRecordingDone: (recording: VoiceRecording) => void;
  onRecordingClose: () => void;
  onClear: () => void;
};

function AudioRow({
  className,
  fileName,
  isRecording,
  isReading,
  onPlay,
  onPick,
  onRecord,
  onRecordingDone,
  onRecordingClose,
  onClear,
}: AudioRowProps) {
  return (
    <div className={cn("space-y-sm rounded-md bg-surface-soft p-sm", className)}>
      <div className="flex items-center gap-sm">
        <Music className="size-5 shrink-0 text-meta" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-title-sm text-ink">소리</p>
          <p className="truncate text-body-sm text-meta">
            {isReading ? "읽는 중이에요" : (fileName ?? "녹음하거나 파일을 선택해요")}
          </p>
        </div>
        {fileName ? (
          <>
            <IconButton Icon={Play} haptic aria-label="소리 듣기" onClick={onPlay} />
            <IconButton Icon={X} haptic aria-label="소리 제거" onClick={onClear} />
          </>
        ) : (
          <div className="flex shrink-0 gap-2xs">
            <Button
              className="w-auto"
              buttonClassName="h-9 min-h-9 w-auto px-sm"
              variant="secondary"
              haptic
              disabled={isRecording}
              onClick={onRecord}
            >
              <Mic className="size-4" strokeWidth={1.75} />
              녹음
            </Button>
            <Button
              className="w-auto"
              buttonClassName="h-9 min-h-9 w-auto px-sm"
              variant="secondary"
              haptic
              disabled={isRecording}
              onClick={onPick}
            >
              파일
            </Button>
          </div>
        )}
      </div>
      {isRecording && <VoiceRecorderBar onDone={onRecordingDone} onClose={onRecordingClose} />}
    </div>
  );
}
