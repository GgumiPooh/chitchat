"use client";

import type { ShellSnapshot } from "@/features/offline-snapshot";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import { AppHeader, Avatar, Container } from "@/shared/ui";
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
      <Container className="pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        <div className="flex flex-col items-center gap-sm py-2xl">
          {/* INFO: The initial rather than the photo — an avatar's object is never cached (§ 16.), so there is nothing to draw but the letter DESIGN.md § 7.7. already falls back to. */}
          <Avatar name={me?.name ?? ""} size="profile" />
          <p className="text-title-md text-ink">{me?.name}</p>
          <p className="text-body-md text-meta">{OFFLINE_MESSAGES.change}</p>
        </div>
      </Container>
      <div className="mx-auto flex w-full max-w-(--content-max-width) flex-col pb-[var(--bottom-inset,0px)]">
        <ThemeSettingsRow />
        <MessageSoundSettingsRow />
      </div>
    </div>
  );
}
