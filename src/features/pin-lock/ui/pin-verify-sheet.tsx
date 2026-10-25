"use client";

import { type Nullable } from "@/shared/lib";
import { BottomSheet } from "@/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { fetchPinSessionState, submitPinHandshake } from "../api/pin-api";
import { PinKeypad } from "./pin-keypad";

export type PinVerifySheetProps = {
  className?: string;
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function PinVerifySheet({
  className,
  isOpen,
  title = "화면 잠금 끄기",
  description = "잠금을 해제하려면 현재 비밀번호를 입력해 주세요",
  onClose,
  onSuccess,
}: PinVerifySheetProps) {
  const [serverPublicKey, setServerPublicKey] = useState<Nullable<string>>(null);
  const [lockedUntil, setLockedUntil] = useState<Nullable<string>>(null);
  const [, setRemainingAttempts] = useState<number>(5);
  const [attemptErrorMessage, setAttemptErrorMessage] = useState<Nullable<string>>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const handleClose = useCallback(() => {
    setAttemptErrorMessage(null);
    setShakeKey(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    void fetchPinSessionState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setServerPublicKey(state.serverPublicKey);
        setLockedUntil(state.lockedUntil);
        setRemainingAttempts(state.remainingAttempts);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setAttemptErrorMessage("비밀번호 설정을 불러오지 못했어요");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
    async (pin: string) => {
      if (isSubmitting || isLocked) {
        return;
      }

      if (!serverPublicKey) {
        setAttemptErrorMessage("서버와 통신할 수 없어요. 다시 시도해 주세요");
        return;
      }

      setIsSubmitting(true);
      const result = await submitPinHandshake(serverPublicKey, {
        mode: "verify",
        pin,
      });
      setIsSubmitting(false);

      if (result.ok) {
        onSuccess();
        handleClose();
        return;
      }

      setShakeKey((k) => k + 1);
      if (result.status === 429 || result.lockedUntil) {
        setLockedUntil(result.lockedUntil);
      } else if (result.status === 401) {
        const attempts = result.remainingAttempts ?? 0;
        setRemainingAttempts(attempts);
        setAttemptErrorMessage(`비밀번호가 일치하지 않아요 (남은 기회 ${attempts}회)`);
      } else {
        setAttemptErrorMessage("비밀번호 확인에 실패했어요. 다시 시도해 주세요");
      }
    },
    [handleClose, isLocked, isSubmitting, onSuccess, serverPublicKey],
  );

  const errorMessage = isLocked
    ? `입력 횟수를 초과했어요. ${secondsLeft}초 후에 다시 시도해 주세요`
    : attemptErrorMessage;

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        title,
        description,
      }}
      onClose={handleClose}
    >
      <div className="py-4">
        <PinKeypad
          title="비밀번호를 입력해 주세요"
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          isLocked={isLocked}
          shakeKey={shakeKey}
          onComplete={handleComplete}
        />
      </div>
    </BottomSheet>
  );
}
