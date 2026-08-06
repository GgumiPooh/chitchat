"use client";

import { updateProfile } from "@/features/update-profile/@x/set-background";
import type { Nullable } from "@/shared/lib";
import { ActionSheet, toast } from "@/shared/ui";
import { ImageIcon, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { copyToBackground } from "../api/copy-to-background";

type BackgroundSlot = "profile" | "chat";

export type SetBackgroundSheetProps = {
  className?: string;
  /** The `media` row the user is looking at, or `null` while the sheet is closed. */
  sourceId: Nullable<string>;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 12.1., § 12.2. 배경으로 설정, offered over a photo in the
 * gallery or in a chat bubble.
 *
 * INFO: Two rows rather than one, because there are two backgrounds and they do not
 * mean the same thing — a profile cover is published to the other participant and a
 * chat wallpaper is not (§ 12.2.). A single 배경으로 설정 would have to pick one of
 * those on the user's behalf, and either choice is a surprise half the time.
 *
 * WARN: The copy runs once per row, not once per sheet. Setting the same photo as
 * both leaves the two columns pointing at two objects, which is what lets either be
 * replaced later without `discardScopedMedia` deleting the other's bytes (§ 12.).
 */
export function SetBackgroundSheet({ className, sourceId, onClose }: SetBackgroundSheetProps) {
  // WARN: A ref, not state, and it is the only thing standing between a slow connection and a leaked object. `ActionSheet` closes itself in the same tick it fires `onSelect`, so this component is already unmounted-in-effect before the first `await` resolves and no `isBusy` state it holds can gate a second tap. The viewer underneath stays up, 배경으로 설정 is still there, and each tap mints another `background/` copy that only the last write is reachable through.
  const isApplyingRef = useRef(false);
  const router = useRouter();

  return (
    <ActionSheet
      className={className}
      isOpen={sourceId !== null}
      header={{ title: "배경으로 설정" }}
      items={[
        { label: "프로필 배경으로", Icon: ImageIcon, onSelect: () => void apply("profile") },
        { label: "채팅방 배경으로", Icon: MessageSquare, onSelect: () => void apply("chat") },
      ]}
      onClose={onClose}
    />
  );

  async function apply(slot: BackgroundSlot) {
    if (!sourceId || isApplyingRef.current) {
      return;
    }

    isApplyingRef.current = true;
    // INFO: The sheet is already closing and the copy is a full-resolution R2 duplicate, so without this the user taps and watches nothing happen for several seconds. `toast.promise` is the only surface still on screen to say so.
    const applied = copyAndWear(sourceId, slot);

    toast.promise(applied, {
      loading: "배경으로 설정하는 중이에요",
      success: slot === "profile" ? "프로필 배경으로 설정했어요" : "채팅방 배경으로 설정했어요",
      error: "배경으로 설정하지 못했어요",
    });

    try {
      await applied;
      // INFO: Every screen that draws a background reads it from its own Server Component render (§ 12.2.), so the saved row reaches them the way § 12.'s profile save does rather than over `user_changed`.
      router.refresh();
    } catch {
      // INFO: Reported by the toast above; swallowed here so the rejection is not also unhandled.
    } finally {
      isApplyingRef.current = false;
      onClose();
    }
  }

  // WARN: The id is a parameter rather than a read of `sourceId`. The sheet closes as it starts, so the state is `null` by the time this resolves — captured at the tap, it is still the photo the user was looking at.
  async function copyAndWear(id: string, slot: BackgroundSlot) {
    const media = await copyToBackground(id);

    await updateProfile(
      slot === "profile"
        ? { profileBackgroundMediaId: media.id }
        : { chatBackgroundMediaId: media.id },
    );
  }
}
