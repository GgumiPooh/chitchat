"use client";

import { useMessageSound } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Volume1 } from "lucide-react";

export type MessageSoundSettingsRowProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 13.6. The 전송음 switch — per device, like 알림 소리 above it.
 */
export function MessageSoundSettingsRow({ className }: MessageSoundSettingsRowProps) {
  const { isEnabled, setEnabled } = useMessageSound();

  return (
    <SettingsRow
      className={className}
      description="메시지를 보내거나 받을 때 작은 소리가 나요"
      Icon={Volume1}
      label="전송음"
      trailing={
        <Switch checked={isEnabled} haptic aria-label="전송음 켜기" onCheckedChange={setEnabled} />
      }
    />
  );
}
