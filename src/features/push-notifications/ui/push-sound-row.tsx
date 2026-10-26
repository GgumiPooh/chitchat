"use client";

import { cn, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Volume2 } from "lucide-react";
import { usePushSettings } from "../model/push-settings-provider";

export type PushSoundRowProps = {
  className?: string;
};

const ENABLED_DESCRIPTION = "알림이 오면 소리로 알려드려요";
const DISABLED_DESCRIPTION = "이 기기에서 알림을 켜면 설정할 수 있어요";
const OFFICE_MODE_LOCKED_DESCRIPTION = "오피스 모드가 켜져 있어 알림 소리가 꺼져 있어요";

/**
 * REQUIREMENTS.md § 16.1. 알림 소리 for this browser installation alone — the
 * preference lives on the `push_subscriptions` row, so a phone can sound while the
 * laptop stays quiet.
 *
 * Locked to OFF when Office Mode is active (REQUIREMENTS.md § 12.).
 */
export function PushSoundRow({ className }: PushSoundRowProps) {
  const { status, isBusy, soundEnabled, isSoundBusy, toggleSound } = usePushSettings();
  const { isOfficeMode } = useOfficeMode();
  // INFO: REQUIREMENTS.md § 16.1. With no subscription the preference has no row to live on, so the switch is disabled rather than storing something the next launch would discard.
  const isActionable = status === "on";
  const isLockedByOffice = isOfficeMode;

  const description = isLockedByOffice
    ? OFFICE_MODE_LOCKED_DESCRIPTION
    : isActionable
      ? ENABLED_DESCRIPTION
      : DISABLED_DESCRIPTION;

  return (
    <SettingsRow
      className={cn(className)}
      description={description}
      Icon={Volume2}
      label="알림 소리"
      trailing={
        <Switch
          checked={!isLockedByOffice && isActionable && soundEnabled}
          disabled={isBusy || isSoundBusy || !isActionable || isLockedByOffice}
          haptic
          isOfflineGated
          aria-label="알림 소리 켜기"
          onCheckedChange={toggleSound}
        />
      }
    />
  );
}
