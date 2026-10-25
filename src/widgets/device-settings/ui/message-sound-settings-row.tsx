"use client";

import { useMessageSound } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Volume1 } from "lucide-react";

export type MessageSoundSettingsRowProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 13.6. The 채팅방 효과음 switch — per device.
 */
export function MessageSoundSettingsRow({ className }: MessageSoundSettingsRowProps) {
  const { isEnabled, setEnabled } = useMessageSound();

  return (
    <SettingsRow
      className={className}
      description="대화 중 메시지를 보내거나 받을 때 효과음이 나요"
      Icon={Volume1}
      label="채팅방 효과음"
      trailing={
        <Switch
          checked={isEnabled}
          haptic
          aria-label="채팅방 효과음 켜기"
          onCheckedChange={setEnabled}
        />
      }
    />
  );
}
