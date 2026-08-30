"use client";

import type { ShellSnapshot } from "@/features/offline-snapshot";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import { AppHeader, Avatar } from "@/shared/ui";
import { MessageSoundSettingsRow, ThemeSettingsRow } from "@/widgets/device-settings";

export type MirrorSettingsProps = {
  className?: string;
  shell: ShellSnapshot;
};

/**
 * 설정 as it was last received (REQUIREMENTS.md § 16.) — the profile, plus the two
 * rows that are per-device `localStorage` state and work with no snapshot at all.
 *
 * WARN: No other row. Every one of the rest either writes (§ 12.) or opens a screen
 * with no snapshot behind it, and a row that cannot do what it says is worse than an
 * absent one.
 */
export function MirrorSettings({ className, shell }: MirrorSettingsProps) {
  const me = shell.participants.find((participant) => participant.id === shell.currentUserId);

  return (
    <div className={className}>
      <AppHeader title="설정" />
      {/* INFO: DESIGN.md § 7.16. `ProfileCover`'s own `h-120` band, full-bleed and not clearing the floating header, so the avatar and name stand where the live screen puts them. */}
      <div className="flex h-120 shrink-0 flex-col items-center justify-end gap-sm bg-surface-soft pb-lg">
        {/* INFO: The initial rather than the photo — an avatar's object is never cached (§ 16.), so there is nothing to draw but the letter DESIGN.md § 7.7. already falls back to. */}
        <Avatar name={me?.name ?? ""} size="profile" />
        <p className="text-title-md text-ink">{me?.name}</p>
        <p className="text-body-sm text-meta">{OFFLINE_MESSAGES.change}</p>
      </div>
      <div className="mx-auto flex w-full max-w-(--content-max-width) flex-col pb-[var(--bottom-inset,0px)]">
        <ThemeSettingsRow />
        <MessageSoundSettingsRow />
      </div>
    </div>
  );
}
