"use client";

import { cn } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Volume2 } from "lucide-react";
import { usePushSettings } from "../model/push-settings-provider";

export type PushSoundRowProps = {
  className?: string;
};

const ENABLED_DESCRIPTION = "알림이 오면 소리로 알려드려요";
const DISABLED_DESCRIPTION = "이 기기에서 알림을 켜면 설정할 수 있어요";

/**
 * REQUIREMENTS.md § 16.1. 알림 소리 for this browser installation alone — the
 * preference lives on the `push_subscriptions` row, so a phone can sound while the
 * laptop stays quiet.
 */
export function PushSoundRow({ className }: PushSoundRowProps) {
  const { status, isBusy, soundEnabled, isSoundBusy, toggleSound } = usePushSettings();
  // INFO: REQUIREMENTS.md § 16.1. With no subscription the preference has no row to live on, so the switch is disabled rather than storing something the next launch would discard.
  const isActionable = status === "on";

  return (
    <SettingsRow
      className={cn(className)}
      description={isActionable ? ENABLED_DESCRIPTION : DISABLED_DESCRIPTION}
      Icon={Volume2}
      label="알림 소리"
      trailing={
        <Switch
          checked={isActionable && soundEnabled}
          disabled={isBusy || isSoundBusy || !isActionable}
          haptic
          isOfflineGated
          aria-label="알림 소리 켜기"
          onCheckedChange={toggleSound}
        />
      }
    />
  );
}
