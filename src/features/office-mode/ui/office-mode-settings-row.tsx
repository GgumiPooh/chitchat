"use client";

import { setPushPreviewEnabled } from "@/features/push-notifications/@x/office-mode";
import { cn, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch, toast } from "@/shared/ui";
import { Briefcase } from "lucide-react";
import { useCallback } from "react";

export type OfficeModeSettingsRowProps = {
  className?: string;
};

const OFFICE_MODE_PREV_PREVIEW_KEY = "jandh:office-mode-prev-preview";

const ENABLED_DESCRIPTION = "미디어 로딩을 차단하고, 화면 노출을 줄이기 위해 알림 내용 표시를 꺼요";
const DISABLED_DESCRIPTION = "사진·영상·파일 및 보관함을 정상적으로 이용해요";

export function OfficeModeSettingsRow({ className }: OfficeModeSettingsRowProps) {
  const { isOfficeMode, setOfficeMode } = useOfficeMode();

  const handleToggle = useCallback(
    async (nextEnabled: boolean) => {
      setOfficeMode(nextEnabled);
      if (nextEnabled) {
        // SEC: Mask push notification preview when Office Mode is turned on
        try {
          const cookieVal = document.cookie
            .split("; ")
            .find((row) => row.startsWith("jandh:push-state="))
            ?.split("=")[1];
          if (cookieVal) {
            const parsed = JSON.parse(decodeURIComponent(cookieVal));
            if (parsed?.previewEnabled === true) {
              window.localStorage.setItem(OFFICE_MODE_PREV_PREVIEW_KEY, "true");
              await setPushPreviewEnabled(false);
            }
          }
        } catch {
          // Push might not be active or supported on this device; ignore
        }
        toast.success("오피스 모드를 켰어요. 알림 내용 표시도 함께 숨겨져요");
      } else {
        // Restore previous preview preference if it was enabled before
        try {
          const wasPreviewEnabled =
            window.localStorage.getItem(OFFICE_MODE_PREV_PREVIEW_KEY) === "true";
          if (wasPreviewEnabled) {
            window.localStorage.removeItem(OFFICE_MODE_PREV_PREVIEW_KEY);
            await setPushPreviewEnabled(true);
          }
        } catch {
          // Ignore
        }
        toast.success("오피스 모드를 껐어요");
      }
    },
    [setOfficeMode],
  );

  return (
    <SettingsRow
      className={cn(className)}
      label="오피스 모드"
      description={isOfficeMode ? ENABLED_DESCRIPTION : DISABLED_DESCRIPTION}
      Icon={Briefcase}
      trailing={
        <Switch
          checked={isOfficeMode}
          haptic
          aria-label="오피스 모드 켜기"
          onCheckedChange={handleToggle}
        />
      }
    />
  );
}
