"use client";

import { cn, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Eye } from "lucide-react";
import { usePushSettings } from "../model/push-settings-provider";

export type PushPreviewRowProps = {
  className?: string;
};

const ENABLED_DESCRIPTION = "알림에 보낸 사람과 메시지 내용을 표시해요";
const DISABLED_DESCRIPTION = "이 기기에서 알림을 켜면 설정할 수 있어요";
const OFFICE_MODE_LOCKED_DESCRIPTION = "오피스 모드가 켜져 있어 알림 내용이 자동으로 숨겨져요";

/**
 * REQUIREMENTS.md § 16.1. 알림 내용 표시 for this browser installation alone — the
 * preference lives on the `push_subscriptions` row (defaulting to false) so a shared
 * or corporate desktop masks sender and message previews while a personal phone can
 * show them.
 */
export function PushPreviewRow({ className }: PushPreviewRowProps) {
  const { status, isBusy, previewEnabled, isPreviewBusy, togglePreview } = usePushSettings();
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
      Icon={Eye}
      label="알림 내용 표시"
      trailing={
        <Switch
          checked={!isLockedByOffice && isActionable && previewEnabled}
          disabled={isBusy || isPreviewBusy || !isActionable || isLockedByOffice}
          haptic
          isOfflineGated
          aria-label="알림 내용 표시 켜기"
          onCheckedChange={togglePreview}
        />
      }
    />
  );
}
