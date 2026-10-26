"use client";

import { PinKeypad } from "@/features/pin-lock/@x/totp";
import type { Nullable } from "@/shared/lib";
import { BottomSheet, Button } from "@/shared/ui";
import { KeyRound, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { submitOtpLogin } from "../api/totp-api";

export type OtpLoginSectionProps = {
  className?: string;
};

export function OtpLoginSection({ className }: OtpLoginSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [lockedUntil, setLockedUntil] = useState<Nullable<string>>(null);
  const [errorMessage, setErrorMessage] = useState<Nullable<string>>(null);
  const [now, setNow] = useState(() => Date.now());

  const handleClose = useCallback(() => {
    if (isRedirecting) {
      return;
    }
    setIsOpen(false);
    setIsSubmitting(false);
    setErrorMessage(null);
    setShakeKey(0);
  }, [isRedirecting]);

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
      if (isSubmitting || isLocked || isRedirecting) {
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await submitOtpLogin(code);

      if (result.ok) {
        setIsRedirecting(true);
        // INFO: REQUIREMENTS.md § 5.1. Replace location on navigation so /login does not remain in history.
        window.location.replace(result.redirectUrl ?? "/");
        return;
      }

      setIsSubmitting(false);
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
    [isLocked, isRedirecting, isSubmitting],
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
        <div className="flex flex-col items-center py-md">
          <div className="mb-3 flex w-full max-w-[320px] items-center justify-center gap-xs rounded-xl bg-surface-soft px-sm py-2 text-caption text-meta">
            <Smartphone className="size-4 shrink-0 text-primary" />
            <span>인증기 앱의 실시간 6자리 번호 (PIN 비밀번호가 아니에요)</span>
          </div>

          <div className="w-full">
            <PinKeypad
              title="OTP 번호 입력"
              subtitle="Google OTP 등 인증기 앱 화면의 6자리 번호예요"
              errorMessage={displayError}
              isLocked={isLocked}
              isSubmitting={isSubmitting || isRedirecting}
              shakeKey={shakeKey}
              submittingText={isRedirecting ? "로그인 완료! 이동 중..." : "로그인 확인 중..."}
              onComplete={handleComplete}
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
