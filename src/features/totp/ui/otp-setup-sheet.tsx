"use client";

import { PinKeypad } from "@/features/pin-lock/@x/totp";
import type { Nullable } from "@/shared/lib";
import { BottomSheet, Button, IconButton, toast } from "@/shared/ui";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { requestOtpSetup, verifyOtpSetup, type OtpSetupResponse } from "../api/totp-api";

export type OtpSetupSheetProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function OtpSetupSheet({ className, isOpen, onClose, onSuccess }: OtpSetupSheetProps) {
  const [setupData, setSetupData] = useState<Nullable<OtpSetupResponse>>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<Nullable<string>>(null);
  const [shakeKey, setShakeKey] = useState(0);

  const handleClose = useCallback(() => {
    setSetupData(null);
    setErrorMessage(null);
    setIsCopied(false);
    setIsLoading(true);
    setShakeKey(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    requestOtpSetup()
      .then((data) => {
        if (!cancelled) {
          setSetupData(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoading(false);
          setErrorMessage("OTP 설정 정보를 불러오지 못했어요");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleCopySecret = useCallback(async () => {
    if (!setupData?.secret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(setupData.secret);
      setIsCopied(true);
      toast.success("비밀키를 복사했어요");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("비밀키를 복사하지 못했어요");
    }
  }, [setupData]);

  const handleComplete = useCallback(
    async (code: string) => {
      if (isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await verifyOtpSetup(code);
      setIsSubmitting(false);

      if (result.ok) {
        toast.success("OTP 로그인을 등록했어요");
        onSuccess();
        handleClose();
      } else {
        setShakeKey((k) => k + 1);
        if (result.error === "replayed") {
          setErrorMessage("이미 사용된 일회용 코드예요. 다음 번호를 기다려 주세요");
        } else {
          setErrorMessage("인증번호가 일치하지 않아요. 다시 확인해 주세요");
        }
      }
    },
    [handleClose, isSubmitting, onSuccess],
  );

  return (
    <BottomSheet
      className={className}
      isTall
      isOpen={isOpen}
      header={{
        title: "OTP 로그인 등록",
        description: "Google Authenticator 등 인증기 앱에 등록해요",
      }}
      onClose={handleClose}
    >
      <div className="flex flex-col items-center gap-md py-md">
        {isLoading ? (
          <div className="flex min-h-[300px] w-full items-center justify-center">
            <LoaderCircle className="size-6 animate-spin text-meta-soft" />
          </div>
        ) : setupData ? (
          <>
            {/* QR Code Container */}
            <div className="flex flex-col items-center gap-xs">
              <div
                className="bg-white overflow-hidden rounded-2xl p-3 shadow-md"

                dangerouslySetInnerHTML={{ __html: setupData.qrSvg }}
                style={{ width: 190, height: 190 }}
              />
              <p className="text-caption text-meta">인증기 앱으로 위 QR 코드를 스캔해 주세요</p>
            </div>

            {/* Manual Secret Key Copy Box */}
            <div className="flex w-full max-w-[320px] items-center justify-between gap-xs rounded-xl bg-surface-soft px-sm py-xs">
              <div className="flex flex-col overflow-hidden">
                <span className="text-caption text-meta">직접 입력할 비밀키</span>
                <span className="truncate font-mono text-body-sm font-semibold text-ink select-all">
                  {setupData.secret}
                </span>
              </div>
              <IconButton
                className="shrink-0"
                variant="plain"
                Icon={isCopied ? Check : Copy}
                haptic
                aria-label="비밀키 복사"
                onClick={() => void handleCopySecret()}
              />
            </div>

            {/* 6-digit verification Keypad */}
            <div className="w-full pt-xs">
              <PinKeypad
                title="인증번호 6자리 입력"
                subtitle="앱에 등록 후 표시되는 6자리 번호를 입력해 주세요"
                errorMessage={errorMessage}
                isSubmitting={isSubmitting}
                shakeKey={shakeKey}
                onComplete={handleComplete}
              />
            </div>
          </>
        ) : (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-sm">
            <p className="text-body-sm text-semantic-error">{errorMessage}</p>
            <Button
              variant="secondary"
              onClick={() => {
                setIsLoading(true);
                setErrorMessage(null);
                requestOtpSetup()
                  .then((data) => {
                    setSetupData(data);
                    setIsLoading(false);
                  })
                  .catch(() => {
                    setIsLoading(false);
                    setErrorMessage("OTP 설정 정보를 불러오지 못했어요");
                  });
              }}
            >
              다시 시도
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
