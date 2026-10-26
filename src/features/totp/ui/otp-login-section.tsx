"use client";

import { PinKeypad } from "@/features/pin-lock/@x/totp";
import type { Nullable } from "@/shared/lib";
import { BottomSheet, Button } from "@/shared/ui";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { submitOtpLogin } from "../api/totp-api";

export type OtpLoginSectionProps = {
  className?: string;
};

export function OtpLoginSection({ className }: OtpLoginSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [lockedUntil, setLockedUntil] = useState<Nullable<string>>(null);
  const [errorMessage, setErrorMessage] = useState<Nullable<string>>(null);
  const [now, setNow] = useState(() => Date.now());

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setErrorMessage(null);
    setShakeKey(0);
  }, []);

  useEffect(() => {
    if (!lockedUntil) {
      return;
    }
    const target = new Date(lockedUntil).getTime();
    if (target <= Date.now()) {
      return;
    }
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= target) {
        clearInterval(interval);
      }
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [lockedUntil]);

  const lockedUntilMs = lockedUntil ? new Date(lockedUntil).getTime() : 0;
  const secondsLeft = Math.max(0, Math.ceil((lockedUntilMs - now) / 1000));
  const isLocked = secondsLeft > 0;

  const handleComplete = useCallback(
    async (code: string) => {
      if (isSubmitting || isLocked) {
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await submitOtpLogin(code);
      setIsSubmitting(false);

      if (result.ok) {
        // INFO: REQUIREMENTS.md § 5.1. Replace location on navigation so /login does not remain in history.
        window.location.replace(result.redirectUrl ?? "/");
        return;
      }

      setShakeKey((k) => k + 1);

      if (result.error === "too_many_attempts") {
        if (result.lockedUntil) {
          setLockedUntil(result.lockedUntil);
        } else {
          setErrorMessage("입력 횟수를 초과했어요. 잠시 후 다시 시도해 주세요");
        }
      } else if (result.error === "replayed") {
        setErrorMessage("이미 사용된 일회용 코드예요. 다음 번호를 기다려 주세요");
      } else if (result.error === "collision") {
        setErrorMessage("일치하는 계정이 2개 감지되었어요. 30초 후 다시 시도해 주세요");
      } else if (result.error === "no_totp_enrolled") {
        setErrorMessage("등록된 OTP 계정이 없어요. Google로 먼저 로그인해 주세요");
      } else {
        const attempts = result.remainingAttempts ?? 0;
        setErrorMessage(`인증번호가 일치하지 않아요 (남은 기회 ${attempts}회)`);
      }
    },
    [isLocked, isSubmitting],
  );

  const displayError = isLocked
    ? `입력 횟수를 초과했어요. ${secondsLeft}초 후에 다시 시도해 주세요`
    : errorMessage;

  return (
    <>
      <Button className={className} variant="secondary" haptic onClick={() => setIsOpen(true)}>
        <KeyRound className="mr-1.5 size-4" />
        OTP 번호로 로그인
      </Button>

      <BottomSheet
        isOpen={isOpen}
        header={{
          title: "OTP 로그인",
          description: "인증기 앱에 표시된 6자리 번호를 입력해 주세요",
        }}
        onClose={handleClose}
      >
        <div className="py-md">
          <PinKeypad
            title="인증번호 6자리"
            errorMessage={displayError}
            isSubmitting={isSubmitting}
            isLocked={isLocked}
            shakeKey={shakeKey}
            onComplete={handleComplete}
          />
        </div>
      </BottomSheet>
    </>
  );
}
