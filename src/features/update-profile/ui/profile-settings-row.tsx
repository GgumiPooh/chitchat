"use client";

import type { Nullable } from "@/shared/lib";
import { SettingsRow } from "@/shared/ui";
import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileEditorSheet } from "./profile-editor-sheet";

export type ProfileSettingsRowProps = {
  className?: string;
  /** WARN: The **resolved** display name (REQUIREMENTS.md § 8.7.), which is what the sheet seeds its field from. */
  nickname: string;
  avatarMediaId: Nullable<string>;
};

/**
 * REQUIREMENTS.md § 12. The entry point to the profile editor.
 *
 * INFO: A row of its own rather than the profile block above it, because tapping
 * that block's avatar opens the § 7.10. viewer — the same thing tapping an avatar
 * does anywhere else in the app, and it cannot mean two things on one screen.
 */
export function ProfileSettingsRow({
  className,
  nickname,
  avatarMediaId,
}: ProfileSettingsRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <SettingsRow
        className={className}
        label="프로필"
        description="이름과 프로필 사진을 바꿀 수 있어요"
        Icon={UserRound}
        haptic
        onClick={() => setIsOpen(true)}
      />
      {/* WARN: Keyed by what it seeds from. The sheet holds the name in its own state, so a save has to remount it or the next open reseeds from the value that was replaced. */}
      <ProfileEditorSheet
        key={`${nickname}:${avatarMediaId}`}
        isOpen={isOpen}
        nickname={nickname}
        avatarMediaId={avatarMediaId}
        onClose={() => setIsOpen(false)}
        // INFO: The screen is a Server Component reading `users` directly, so the saved row reaches it by re-rendering rather than over `user_changed` (§ 8.4.), which only carries the participant set to clients that subscribe to it.
        onSaved={() => router.refresh()}
      />
    </>
  );
}
