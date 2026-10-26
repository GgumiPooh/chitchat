"use client";

import { PinVerifySheet } from "@/features/pin-lock/@x/office-mode";
import {
  setPushPreviewEnabled,
  setPushSoundEnabled,
} from "@/features/push-notifications/@x/office-mode";
import { cn, setDevicePinLockEnabled, useOfficeMode } from "@/shared/lib";
import { SettingsRow, Switch, toast } from "@/shared/ui";
import { Briefcase } from "lucide-react";
import { useCallback, useState } from "react";

export type OfficeModeSettingsRowProps = {
  className?: string;
};

const OFFICE_MODE_PREV_PREVIEW_KEY = "jandh:office-mode-prev-preview";
const OFFICE_MODE_PREV_SOUND_KEY = "jandh:office-mode-prev-sound";

const ENABLED_DESCRIPTION = "미디어와 소리를 차단하고, 화면 잠금과 알림 내용 숨김을 켜요";
const DISABLED_DESCRIPTION = "사진·영상·파일, 효과음 및 보관함을 정상적으로 이용해요";

export function OfficeModeSettingsRow({ className }: OfficeModeSettingsRowProps) {
  const { isOfficeMode, setOfficeMode } = useOfficeMode();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  const handleToggle = useCallback(
    async (nextEnabled: boolean) => {
      if (nextEnabled) {
        setOfficeMode(true);
        // SEC: Turning on Office Mode strictly enforces Screen Lock mode
        setDevicePinLockEnabled(true);

        // SEC: Mask push notification preview and mute notification sound when Office Mode is turned on
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
            if (parsed?.soundEnabled === true) {
              window.localStorage.setItem(OFFICE_MODE_PREV_SOUND_KEY, "true");
              await setPushSoundEnabled(false);
            }
            const nextCookie = {
              ...parsed,
              previewEnabled: false,
              soundEnabled: false,
            };
            document.cookie = `jandh:push-state=${encodeURIComponent(JSON.stringify(nextCookie))}; path=/; max-age=31536000; SameSite=Lax`;
          }
        } catch {
          // Push might not be active or supported on this device; ignore
        }
        toast.success("오피스 모드를 켰어요. 화면 잠금, 알림 내용 숨김과 무음 처리가 켜져요");
        return;
      }

      // SEC: Turning off Office Mode requires verifying current PIN
      setIsVerifyOpen(true);
    },
    [setOfficeMode],
  );

  const handleVerifySuccess = useCallback(async () => {
    setOfficeMode(false);
    // Restore previous preview and sound preferences if they were enabled before
    try {
      const wasPreviewEnabled =
        window.localStorage.getItem(OFFICE_MODE_PREV_PREVIEW_KEY) === "true";
      if (wasPreviewEnabled) {
        window.localStorage.removeItem(OFFICE_MODE_PREV_PREVIEW_KEY);
        await setPushPreviewEnabled(true);
      }
      const wasSoundEnabled = window.localStorage.getItem(OFFICE_MODE_PREV_SOUND_KEY) === "true";
      if (wasSoundEnabled) {
        window.localStorage.removeItem(OFFICE_MODE_PREV_SOUND_KEY);
        await setPushSoundEnabled(true);
      }
      const cookieVal = document.cookie
        .split("; ")
        .find((row) => row.startsWith("jandh:push-state="))
        ?.split("=")[1];
      if (cookieVal) {
        const parsed = JSON.parse(decodeURIComponent(cookieVal));
        const nextCookie = {
          ...parsed,
          ...(wasPreviewEnabled ? { previewEnabled: true } : {}),
          ...(wasSoundEnabled ? { soundEnabled: true } : {}),
        };
        document.cookie = `jandh:push-state=${encodeURIComponent(JSON.stringify(nextCookie))}; path=/; max-age=31536000; SameSite=Lax`;
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
