"use client";

import type { MediaDraft } from "@/entities/media";
import {
  MediaEditor,
  MediaPickerSheet,
  uploadDraft,
} from "@/features/upload-media/@x/update-profile";
import { AVATAR_MAX_EDGE, MAX_NICKNAME_LENGTH, toMediaUrl } from "@/shared/config";
import type { Nullable, Optional } from "@/shared/lib";
import { Avatar, BottomSheet, Button, Input, toast } from "@/shared/ui";
import { useState } from "react";
import { updateProfile, type ProfileBody } from "../api/write-profile";
import { useAvatarDraft } from "../model/use-avatar-draft";

// INFO: DESIGN.md § 7.7. The avatar is a circle, so the crop is square and the ratio chips have nothing left to offer.
const AVATAR_ASPECT_RATIO = 1;

export type ProfileEditorSheetProps = {
  className?: string;
  isOpen: boolean;
  /** WARN: The **resolved** display name (REQUIREMENTS.md § 8.7.), never the raw column — an empty nickname would seed a blank field the user has to retype before 저장 does anything. */
  nickname: string;
  avatarMediaId: Nullable<string>;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * REQUIREMENTS.md § 12. The nickname and photo the user owns. The name written
 * here is the one every bubble and system sentence renders (§ 8.7.), past messages
 * included — nothing is copied onto a row, so a rename reaches all of them.
 *
 * INFO: Saving broadcasts nothing of its own. The write lands on `users`, so § 6.'s
 * trigger fires `user_changed` and § 8.4. carries it to every open screen.
 */
export function ProfileEditorSheet({
  className,
  isOpen,
  nickname,
  avatarMediaId,
  onClose,
  onSaved,
}: ProfileEditorSheetProps) {
  const [name, setName] = useState(nickname);
  // INFO: The photo the crop is running on. It is not staged until the editor completes — backing out of a crop is backing out of the pick (§ 12.).
  const [cropping, setCropping] = useState<Nullable<MediaDraft>>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const avatar = useAvatarDraft();
  const trimmed = name.trim();
  const hasNameChange = trimmed.length > 0 && trimmed !== nickname;
  const hasAvatarChange = avatar.staged !== null || avatar.isCleared;
  const canSubmit = (hasNameChange || hasAvatarChange) && !isSubmitting && !avatar.isReading;

  return (
    <>
      {/* WARN: Closed while the editor is up, for § 13.4.'s reason — `MediaEditor` portals into the app shell and this drawer portals into `body`, so no z-index inside the shell can lift it over this. */}
      <BottomSheet
        className={className}
        isOpen={isOpen && cropping === null}
        header={{ title: "프로필 편집" }}
        onClose={handleClose}
      >
        <div className="space-y-md pt-2xs">
          <div className="flex flex-col items-center gap-xs">
            <button
              className="cursor-pointer rounded-full transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary active:opacity-70"
              type="button"
              aria-label="프로필 사진 바꾸기"
              onClick={openPicker}
            >
              <Avatar name={trimmed || nickname} size="profile" src={toPreviewUrl()} />
            </button>
            <div className="flex items-center gap-2xs">
              <Button
                className="w-auto"
                buttonClassName="h-9 min-h-9 w-auto px-sm"
                variant="secondary"
                haptic
                onClick={openPicker}
              >
                {avatar.isReading ? "읽는 중이에요" : "사진 바꾸기"}
              </Button>
              {toPreviewUrl() && (
                <Button className="h-9 w-auto px-sm" variant="ghost" onClick={avatar.clear}>
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
      <MediaPickerSheet
        accept="image/*"
        isOpen={isPickerOpen}
        isMultiple={false}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(files) => files[0] && void pick(files[0])}
      />
      {cropping && (
        // WARN: Keyed by the draft — `MediaEditor` mints its source object URL once per mount, so re-cropping a replaced photo has to be a second mount.
        <MediaEditor
          key={cropping.id}
          draft={cropping}
          editOptions={{ maxEdge: AVATAR_MAX_EDGE }}
          fixedAspectRatio={AVATAR_ASPECT_RATIO}
          onDone={(edited) => {
            avatar.stage(edited);
            setCropping(null);
          }}
          onCancel={() => setCropping(null)}
        />
      )}
    </>
  );

  function toPreviewUrl(): Optional<string> {
    if (avatar.staged) {
      return avatar.staged.previewUrl;
    }

    return avatar.isCleared || !avatarMediaId ? undefined : toMediaUrl(avatarMediaId);
  }

  function openPicker() {
    setIsPickerOpen(true);
  }

  async function pick(file: File) {
    const draft = await avatar.read(file);

    // INFO: Straight into the crop rather than staging what was picked. The § 7.10. viewer shows the stored object whole, so a photo that is not square there would be framed differently from the circle it was chosen in.
    if (draft) {
      setCropping(draft);
    }
  }

  function handleClose() {
    setName(nickname);
    avatar.reset();
    onClose();
  }

  async function submit() {
    setIsSubmitting(true);

    try {
      const body: ProfileBody = {
        ...(hasNameChange ? { nickname: trimmed } : {}),
        ...(await toAvatarPatch()),
      };

      await updateProfile(body);
      onSaved();
      handleClose();
    } catch {
      toast.error("프로필을 저장하지 못했어요");
    } finally {
      setIsSubmitting(false);
    }
  }

  /** INFO: REQUIREMENTS.md § 12. An untouched photo leaves the key out of the body entirely, so the row keeps what it has; 기본 이미지 is an explicit `null`. */
  async function toAvatarPatch(): Promise<ProfileBody> {
    // WARN: A photo that lands and then a `PATCH` that fails leaves one registered object nothing points at. It is unreachable — `canReadMedia` admits an avatar only while somebody wears it, and § 10.'s grid never had it — so it costs bucket space and nothing else, which is the same trade § 9. already takes on a re-PUT.
    if (avatar.staged) {
      const media = await uploadDraft(avatar.staged, { scope: "avatar" });

      return { avatarMediaId: media.id };
    }

    return avatar.isCleared ? { avatarMediaId: null } : {};
  }
}
