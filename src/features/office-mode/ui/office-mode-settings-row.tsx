"use client";

import { PinVerifySheet } from "@/features/pin-lock/@x/office-mode";
import { setPushPreviewEnabled } from "@/features/push-notifications/@x/office-mode";
import { cn, setDevicePinLockEnabled, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch, toast } from "@/shared/ui";
import { Briefcase } from "lucide-react";
import { useCallback, useState } from "react";

export type OfficeModeSettingsRowProps = {
  className?: string;
};

const OFFICE_MODE_PREV_PREVIEW_KEY = "jandh:office-mode-prev-preview";

const ENABLED_DESCRIPTION = "미디어 로딩을 차단하고, 화면 잠금과 알림 내용 숨김을 켜요";
const DISABLED_DESCRIPTION = "사진·영상·파일 및 보관함을 정상적으로 이용해요";

export function OfficeModeSettingsRow({ className }: OfficeModeSettingsRowProps) {
  const { isOfficeMode, setOfficeMode } = useOfficeMode();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  const handleToggle = useCallback(
    async (nextEnabled: boolean) => {
      if (nextEnabled) {
        setOfficeMode(true);
        // SEC: Turning on Office Mode strictly enforces Screen Lock mode
        setDevicePinLockEnabled(true);

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
        toast.success("오피스 모드를 켰어요. 화면 잠금과 알림 내용 숨김이 켜져요");
        return;
      }

      // SEC: Turning off Office Mode requires verifying current PIN
      setIsVerifyOpen(true);
    },
    [setOfficeMode],
  );

  const handleVerifySuccess = useCallback(async () => {
    setOfficeMode(false);
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
  }, [setOfficeMode]);

  return (
    <>
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
      <PinVerifySheet
        isOpen={isVerifyOpen}
        title="오피스 모드 끄기"
        description="오피스 모드를 끄려면 비밀번호를 입력해 주세요"
        onClose={() => setIsVerifyOpen(false)}
        onSuccess={handleVerifySuccess}
      />
    </>
  );
}
