"use client";

import { useMessageSound, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Volume1 } from "lucide-react";

export type MessageSoundSettingsRowProps = {
  className?: string;
};

const ENABLED_DESCRIPTION = "대화 중 메시지를 보내거나 받을 때 효과음이 나요";
const OFFICE_MODE_LOCKED_DESCRIPTION = "오피스 모드가 켜져 있어 채팅방 효과음이 꺼져 있어요";

/**
 * REQUIREMENTS.md § 13.6. The 채팅방 효과음 switch — per device.
 * Locked to OFF when Office Mode is active (REQUIREMENTS.md § 12.).
 */
export function MessageSoundSettingsRow({ className }: MessageSoundSettingsRowProps) {
  const { isEnabled, setEnabled } = useMessageSound();
  const { isOfficeMode } = useOfficeMode();

  const isLockedByOffice = isOfficeMode;
  const description = isLockedByOffice ? OFFICE_MODE_LOCKED_DESCRIPTION : ENABLED_DESCRIPTION;

  return (
    <SettingsRow
      className={className}
      description={description}
      Icon={Volume1}
      label="채팅방 효과음"
      trailing={
        <Switch
          checked={!isLockedByOffice && isEnabled}
          disabled={isLockedByOffice}
          haptic
          aria-label="채팅방 효과음 켜기"
          onCheckedChange={setEnabled}
        />
      }
    />
  );
}
