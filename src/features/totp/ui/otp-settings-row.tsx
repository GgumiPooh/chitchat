"use client";

import { PinVerifySheet } from "@/features/pin-lock/@x/totp";
import { Badge, Button, SettingsRow, toast } from "@/shared/ui";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { disableOtp, fetchOtpStatus } from "../api/totp-api";
import { OtpSetupSheet } from "./otp-setup-sheet";

export type OtpSettingsRowProps = {
  className?: string;
  initialHasOtp?: boolean;
};

type PinActionType = "setup" | "reissue" | "delete";

export function OtpSettingsRow({ className, initialHasOtp = false }: OtpSettingsRowProps) {
  const [hasOtp, setHasOtp] = useState(initialHasOtp);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [pinAction, setPinAction] = useState<PinActionType | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOtpStatus()
      .then((data) => {
        if (!cancelled) {
          setHasOtp(data.hasOtp);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePinVerifySuccess = useCallback(async () => {
    const action = pinAction;
    setPinAction(null);

    if (action === "setup" || action === "reissue") {
      setIsSetupOpen(true);
    } else if (action === "delete") {
      try {
        await disableOtp();
        setHasOtp(false);
        toast.success("OTP 로그인을 해제했어요");
      } catch {
        toast.error("OTP 로그인을 해제하지 못했어요");
      }
    }
  }, [pinAction]);

  const description = hasOtp
    ? "인증기 앱의 6자리 번호로 계정 선택 없이 바로 로그인할 수 있어요"
    : "Google Authenticator 등 인증기 앱을 등록해 원스텝으로 로그인해요";

  let pinTitle = "PIN 비밀번호 확인";
  let pinDescription = "보안을 위해 6자리 PIN 비밀번호를 입력해 주세요";

  if (pinAction === "setup") {
    pinTitle = "PIN 비밀번호 확인";
    pinDescription = "OTP 로그인을 등록하려면 6자리 PIN 비밀번호를 입력해 주세요";
  } else if (pinAction === "reissue") {
    pinTitle = "PIN 비밀번호 확인";
    pinDescription = "OTP를 재발급하려면 6자리 PIN 비밀번호를 입력해 주세요";
  } else if (pinAction === "delete") {
    pinTitle = "PIN 비밀번호 확인";
    pinDescription = "OTP 로그인을 해제하려면 6자리 PIN 비밀번호를 입력해 주세요";
  }

  return (
    <>
      <SettingsRow
        className={className}
        description={description}
        Icon={KeyRound}
        label="OTP 로그인"
        trailing={
          hasOtp ? (
            <div className="flex items-center gap-xs">
              <Badge className="bg-primary-soft font-medium text-primary">사용 중</Badge>
              <Button
                className="w-auto"
                buttonClassName="min-h-9 px-sm text-button-sm"
                variant="secondary"
                haptic
                onClick={() => setPinAction("reissue")}
              >
                재발급
              </Button>
              <Button
                className="w-auto"
                buttonClassName="min-h-9 px-sm text-button-sm"
                variant="ghost"
                haptic
                onClick={() => setPinAction("delete")}
              >
                해제
              </Button>
            </div>
          ) : (
            <Button
              className="w-auto"
              buttonClassName="min-h-9 px-sm text-button-sm"
              variant="secondary"
              haptic
              onClick={() => setPinAction("setup")}
            >
              등록하기
            </Button>
          )
        }
      />

      {/* SEC: Requires user PIN before launching setup/reissue/deletion */}
      <PinVerifySheet
        isOpen={pinAction !== null}
        title={pinTitle}
        description={pinDescription}
        onClose={() => setPinAction(null)}
        onSuccess={() => void handlePinVerifySuccess()}
      />

      <OtpSetupSheet
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        onSuccess={() => setHasOtp(true)}
      />
    </>
  );
}
