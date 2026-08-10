"use client";

import type { MediaDraft } from "@/entities/media";
import {
  DraftPreview,
  MediaEditor,
  VideoTrimmer,
  isWithinDuration,
  uploadDraft,
  useMediaPicker,
} from "@/features/upload-media/@x/update-profile";
import {
  AVATAR_MAX_EDGE,
  BACKGROUND_MAX_EDGE,
  MAX_BACKGROUND_VIDEO_DURATION,
  MAX_NICKNAME_LENGTH,
  isVideoMime,
  toMediaUrl,
} from "@/shared/config";
import type { Nullable, Optional } from "@/shared/lib";
import { Avatar, BottomSheet, Button, HapticTarget, Input, toast } from "@/shared/ui";
import { useState } from "react";
import { updateProfile, type ProfileBody } from "../api/write-profile";
import { usePhotoDraft } from "../model/use-photo-draft";

// INFO: DESIGN.md § 7.7. The avatar is a circle, so the crop is square and the ratio chips have nothing left to offer.
const AVATAR_ASPECT_RATIO = 1;

/** Which slot the picker and the editor are currently working for. */
type PhotoSlot = "avatar" | "background";

export type ProfileEditorSheetProps = {
  className?: string;
  isOpen: boolean;
  /** WARN: The **resolved** display name (REQUIREMENTS.md § 8.7.), never the raw column — an empty nickname would seed a blank field the user has to retype before 저장 does anything. */
  nickname: string;
  avatarMediaId: Nullable<string>;
  /** REQUIREMENTS.md § 12.1. The profile cover behind the § 12.3. profile screen. */
  profileBackgroundMediaId: Nullable<string>;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * REQUIREMENTS.md § 12. The nickname, photo and cover the user owns. The name
 * written here is the one every bubble and system sentence renders (§ 8.7.), past
 * messages included — nothing is copied onto a row, so a rename reaches all of them.
 *
 * INFO: Saving broadcasts nothing of its own. The write lands on `users`, so § 6.'s
 * trigger fires `user_changed` and § 8.4. carries it to every open screen.
 *
 * WARN: The **chat** wallpaper is not edited here (§ 12.2.). It is not part of what
 * the other participant sees, so putting it in the sheet named 프로필 편집 would say
 * it is — it has its own Settings row instead.
 */
export function ProfileEditorSheet({
  className,
  isOpen,
  nickname,
  avatarMediaId,
  profileBackgroundMediaId,
  onClose,
  onSaved,
}: ProfileEditorSheetProps) {
  const [name, setName] = useState(nickname);
  // INFO: The photo the crop is running on. It is not staged until the editor completes — backing out of a crop is backing out of the pick (§ 12.).
  const [cropping, setCropping] = useState<Nullable<MediaDraft>>(null);
  // INFO: Which slot the editor below is working for. It is written by the pick itself (REQUIREMENTS.md § 12.1.), never by the tap that opened a picker — the OS dialog answers asynchronously and the two slots must not be able to cross.
  const [slot, setSlot] = useState<PhotoSlot>("avatar");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // INFO: REQUIREMENTS.md § 12.1. Only the cover takes a video; the avatar is drawn in an `<img>` everywhere in the app.
  const [trimming, setTrimming] = useState<Nullable<MediaDraft>>(null);
  const avatar = usePhotoDraft("avatar");
  const background = usePhotoDraft("background");
  const picking = slot === "avatar" ? avatar : background;
  // INFO: An input per slot rather than one with a computed `accept`. A tap has to open the OS picker on its own call stack, so an `accept` derived from state would still be the previous slot's when the dialog is already up.
  const avatarPicker = useMediaPicker({
    accept: "image/*",
    onSelect: (files) => files[0] && void pick("avatar", files[0]),
  });
  // INFO: REQUIREMENTS.md § 12.1. The cover takes a video; the avatar does not. `usePhotoDraft` re-checks either way, since a desktop file dialog hands over whatever the user names.
  const backgroundPicker = useMediaPicker({
    accept: "image/*,video/*",
    onSelect: (files) => files[0] && void pick("background", files[0]),
  });
  const trimmed = name.trim();
  const hasNameChange = trimmed.length > 0 && trimmed !== nickname;
  const hasPhotoChange =
    avatar.staged !== null ||
    avatar.isCleared ||
    background.staged !== null ||
    background.isCleared;
  const isReading = avatar.isReading || background.isReading;
  const canSubmit = (hasNameChange || hasPhotoChange) && !isSubmitting && !isReading;
  const avatarUrl = toAvatarUrl();
  const backgroundUrl = toBackgroundUrl();

  return (
    <>
      {/* WARN: Closed while the editor is up, for § 13.4.'s reason — `MediaEditor` portals into the app shell and this drawer portals into `body`, so no z-index inside the shell can lift it over this. */}
      <BottomSheet
        className={className}
        isOpen={isOpen && cropping === null && trimming === null}
        header={{ title: "프로필 편집" }}
        onClose={handleClose}
      >
        <div className="space-y-md pt-2xs">
          <div className="space-y-2xs">
            <p className="px-2xs text-body-sm text-meta">배경</p>
            {/* WARN: DESIGN.md § 7.16. A letterbox preview, deliberately NOT either surface's real geometry — the cover is worn at half the viewport on Settings and at the whole of it on the profile screen, so no single box here can promise the framing. It shows what was picked; the crop that matters is free-form for exactly this reason. */}
            <HapticTarget className="flex overflow-hidden rounded-md" keepsScroll>
              <button
                className="relative w-full cursor-pointer overflow-hidden rounded-md bg-surface-strong outline-none group-active:opacity-70 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
                style={{ aspectRatio: "3 / 2" }}
                type="button"
                aria-label="프로필 배경 바꾸기"
                onClick={backgroundPicker.open}
              >
                {backgroundUrl || background.staged ? (
                  // INFO: A staged video previews as itself, playing — a still of a clip chosen for its motion reads as a failed load (§ 12.1.).
                  <DraftPreview draft={background.staged} src={backgroundUrl} />
                ) : (
                  <span className="flex size-full items-center justify-center text-body-sm text-meta">
                    배경 사진이나 영상 고르기
                  </span>
                )}
              </button>
            </HapticTarget>
            {backgroundUrl && (
              <div className="flex justify-end">
                <Button
                  className="w-auto"
                  buttonClassName="h-9 min-h-9 w-auto px-sm"
                  variant="ghost"
                  haptic
                  onClick={background.clear}
                >
                  배경 없애기
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-col items-center gap-xs">
            <HapticTarget className="flex rounded-full">
              <button
                className="cursor-pointer rounded-full transition-opacity outline-none group-active:opacity-70 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary active:opacity-70"
                type="button"
                aria-label="프로필 사진 바꾸기"
                onClick={avatarPicker.open}
              >
                <Avatar name={trimmed || nickname} size="profile" src={avatarUrl} />
              </button>
            </HapticTarget>
            <div className="flex items-center gap-2xs">
              <Button
                className="w-auto"
                buttonClassName="h-9 min-h-9 w-auto px-sm"
                variant="secondary"
                haptic
                onClick={avatarPicker.open}
              >
                {isReading ? "읽는 중이에요" : "사진 바꾸기"}
              </Button>
              {avatarUrl && (
                <Button
                  className="w-auto"
                  buttonClassName="h-9 min-h-9 w-auto px-sm"
                  variant="ghost"
                  haptic
                  onClick={avatar.clear}
                >
                  기본 이미지
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2xs">
            <label className="block px-2xs text-body-sm text-meta" htmlFor="profile-nickname">
              이름
            </label>
            <Input
              value={name}
              maxLength={MAX_NICKNAME_LENGTH}
              placeholder="이름"
              id="profile-nickname"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button disabled={!canSubmit} haptic onClick={() => void submit()}>
            {isSubmitting ? "저장하는 중이에요" : "저장"}
          </Button>
        </div>
      </BottomSheet>
      {avatarPicker.input}
      {backgroundPicker.input}
      {trimming && (
        // INFO: REQUIREMENTS.md § 12.1. The cap is only handed over when the clip actually exceeds it. Inside the window there is nothing to enforce, so both handles move and the trimmer is an ordinary edit — a clip that needs no cut is finished by tapping 완료.
        // WARN: A container with no readable duration is capped. A missing duration is exactly the case that would otherwise walk past the ceiling that makes a background video affordable at all.
        <VideoTrimmer
          key={trimming.id}
          draft={trimming}
          maxDurationMs={
            trimming.durationMs !== null &&
            isWithinDuration(trimming.durationMs, MAX_BACKGROUND_VIDEO_DURATION)
              ? undefined
              : MAX_BACKGROUND_VIDEO_DURATION
          }
          onCancel={() => setTrimming(null)}
          onDone={(file) => void stageTrimmed(file)}
        />
      )}
      {cropping && (
        // WARN: Keyed by the draft — `MediaEditor` mints its source object URL once per mount, so re-cropping a replaced photo has to be a second mount.
        <MediaEditor
          key={cropping.id}
          draft={cropping}
          editOptions={{ maxEdge: slot === "avatar" ? AVATAR_MAX_EDGE : BACKGROUND_MAX_EDGE }}
          // INFO: REQUIREMENTS.md § 12.1. The cover is free-form. A background is drawn `object-cover` at whatever the visual viewport is, so pinning a ratio here would crop it twice.
          fixedAspectRatio={slot === "avatar" ? AVATAR_ASPECT_RATIO : undefined}
          onDone={(edited) => {
            picking.stage(edited);
            setCropping(null);
          }}
          onCancel={() => setCropping(null)}
        />
      )}
    </>
  );

  function toAvatarUrl(): Optional<string> {
    if (avatar.staged) {
      return avatar.staged.previewUrl ?? undefined;
    }

    return avatar.isCleared || !avatarMediaId ? undefined : toMediaUrl(avatarMediaId);
  }

  function toBackgroundUrl(): Optional<string> {
    if (background.staged) {
      return background.staged.previewUrl ?? undefined;
    }

    // WARN: The **thumb**, not the original. A stored cover may be a video (§ 12.1.), and its thumb is the poster frame this `<img>` can actually draw — the original would be a video URL in an image element. A still is also all this 3:2 box was ever showing.
    return background.isCleared || !profileBackgroundMediaId
      ? undefined
      : toMediaUrl(profileBackgroundMediaId);
  }

  // WARN: The slot is taken from the input that fired, never read off `slot`. The state write below only settles in time for the editor this schedules — the draft has to come from the picker's own identity.
  async function pick(target: PhotoSlot, file: File) {
    setSlot(target);

    const draft = await (target === "avatar" ? avatar : background).read(file);

    if (!draft) {
      return;
    }

    // INFO: REQUIREMENTS.md § 12.1. A video is not cropped — it is trimmed, and every pick gets the trimmer whether or not it runs past the cap.
    if (isVideoMime(draft.mime)) {
      setTrimming(draft);

      return;
    }

    // INFO: Straight into the crop rather than staging what was picked. The § 7.10. viewer shows the stored object whole, so a photo that is not square there would be framed differently from the circle it was chosen in — and the cover gets the same editor so a wide photo can be aimed before it is worn.
    setCropping(draft);
  }

  // INFO: The trimmed file is re-read rather than patched onto the old draft — its poster, dimensions and duration all belong to the new clip, and `toMediaDraft` is the one place that derives them.
  async function stageTrimmed(file: File) {
    setTrimming(null);

    const draft = await background.read(file);

    if (draft) {
      background.stage(draft);
    }
  }

  function handleClose() {
    setName(nickname);
    avatar.reset();
    background.reset();
    onClose();
  }

  async function submit() {
    setIsSubmitting(true);

    try {
      const [avatarPatch, backgroundPatch] = await Promise.all([
        toPhotoPatch("avatar"),
        toPhotoPatch("background"),
      ]);

      await updateProfile({
        ...(hasNameChange ? { nickname: trimmed } : {}),
        ...avatarPatch,
        ...backgroundPatch,
      });
      onSaved();
      handleClose();
    } catch {
      toast.error("프로필을 저장하지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }

  /** INFO: REQUIREMENTS.md § 12. An untouched photo leaves the key out of the body entirely, so the row keeps what it has; 기본 이미지 and 배경 없애기 are an explicit `null`. */
  // WARN: The parameter is named apart from the `slot` state above it. Shadowing it would compile and would mean the opposite thing — this runs for both slots regardless of which one the picker last worked for.
  async function toPhotoPatch(target: PhotoSlot): Promise<ProfileBody> {
    const draft = target === "avatar" ? avatar : background;
    const key = target === "avatar" ? "avatarMediaId" : "profileBackgroundMediaId";

    // WARN: A photo that lands and then a `PATCH` that fails leaves one registered object nothing points at. It is unreachable — `canReadMedia` admits a profile photo only while somebody wears it, and § 10.'s grid never had it — so it costs bucket space and nothing else, which is the same trade § 9. already takes on a re-PUT.
    if (draft.staged) {
      const media = await uploadDraft(draft.staged, { scope: target });

      return { [key]: media.id };
    }

    return draft.isCleared ? { [key]: null } : {};
  }
}
