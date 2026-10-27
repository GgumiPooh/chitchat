"use client";

import { PinVerifySheet } from "@/features/pin-lock/@x/totp";
import { Button, SettingsRow } from "@/shared/ui";
import { KeyRound } from "lucide-react";
import { useCallback, useState } from "react";
import { OtpCodeViewerSheet } from "./otp-code-viewer-sheet";

export type OtpSettingsRowProps = {
  className?: string;
  initialHasOtp?: boolean;
};

export function OtpSettingsRow({ className }: OtpSettingsRowProps) {
  const [isPinVerifyOpen, setIsPinVerifyOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const handlePinSuccess = useCallback(() => {
    setIsPinVerifyOpen(false);
    setIsViewerOpen(true);
  }, []);

  return (
    <>
      <SettingsRow
        className={className}
        description="다른 기기에서 로그인할 수 있는 1회용 번호를 확인해요"
        Icon={KeyRound}
        label="1회용 로그인 번호"
        trailing={
          <Button
            className="w-auto"
            buttonClassName="min-h-9 px-sm text-button-sm"
            variant="secondary"
            haptic
            onClick={() => setIsPinVerifyOpen(true)}
          >
            번호 확인
          </Button>
        }
      />

      <PinVerifySheet
        isOpen={isPinVerifyOpen}
        title="PIN 비밀번호 확인"
        description="1회용 로그인 번호를 확인하려면 6자리 PIN 비밀번호를 입력해 주세요"
        onClose={() => setIsPinVerifyOpen(false)}
        onSuccess={handlePinSuccess}
      />

      <OtpCodeViewerSheet isOpen={isViewerOpen} onClose={() => setIsViewerOpen(false)} />
    </>
  );
}
