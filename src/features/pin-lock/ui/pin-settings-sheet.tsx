"use client";

import { type Nullable } from "@/shared/lib";
import { BottomSheet, toast } from "@/shared/ui";
import { useCallback, useEffect, useState } from "react";
import { fetchPinSessionState, submitPinHandshake } from "../api/pin-api";
import { PinKeypad } from "./pin-keypad";

export type PinSettingsSheetProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
};

export function PinSettingsSheet({ className, isOpen, onClose }: PinSettingsSheetProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const [serverPublicKey, setServerPublicKey] = useState<Nullable<string>>(null);
  const [lockedUntil, setLockedUntil] = useState<Nullable<string>>(null);
  const [, setRemainingAttempts] = useState<number>(5);
  const [attemptErrorMessage, setAttemptErrorMessage] = useState<Nullable<string>>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const [now, setNow] = useState(() => Date.now());

  const handleClose = useCallback(() => {
    setStep(1);
    setCurrentPin("");
    setNewPin("");
    setAttemptErrorMessage(null);
    setShakeKey(0);
    onClose();
  }, [onClose]);

  // INFO: Fetch server public key and lockout status whenever the sheet opens.
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

      if (step === 1) {
        setCurrentPin(pin);
        setStep(2);
        setAttemptErrorMessage(null);
        return;
      }

      if (step === 2) {
        setNewPin(pin);
        setStep(3);
        setAttemptErrorMessage(null);
        return;
      }

      if (step === 3) {
        if (pin !== newPin) {
          setShakeKey((k) => k + 1);
          setStep(2);
          setNewPin("");
          setAttemptErrorMessage("입력한 새 비밀번호가 서로 달라요. 다시 입력해 주세요");
          return;
        }

        if (!serverPublicKey) {
          setAttemptErrorMessage("서버와 통신할 수 없어요. 다시 시도해 주세요");
          return;
        }

        setIsSubmitting(true);
        const result = await submitPinHandshake(serverPublicKey, {
          mode: "change",
          currentPin,
          newPin: pin,
        });
        setIsSubmitting(false);

        if (result.ok) {
          toast.success("비밀번호를 변경했어요");
          handleClose();
          return;
        }

        // INFO: On failure, reset back to step 1 and notify remaining attempts or lockout.
        setShakeKey((k) => k + 1);
        setStep(1);
        setCurrentPin("");
        setNewPin("");

        if (result.status === 429 || result.lockedUntil) {
          setLockedUntil(result.lockedUntil);
        } else if (result.status === 401) {
          const attempts = result.remainingAttempts ?? 0;
          setRemainingAttempts(attempts);
          setAttemptErrorMessage(`비밀번호가 일치하지 않아요 (남은 기회 ${attempts}회)`);
        } else {
          setAttemptErrorMessage("비밀번호 변경에 실패했어요. 다시 시도해 주세요");
        }
      }
    },
    [currentPin, handleClose, isLocked, isSubmitting, newPin, serverPublicKey, step],
  );

  const errorMessage = isLocked
    ? `입력 횟수를 초과했어요. ${secondsLeft}초 후에 다시 시도해 주세요`
    : attemptErrorMessage;

  let title = "현재 비밀번호를 입력해 주세요";

  if (step === 2) {
    title = "새 비밀번호를 입력해 주세요";
  } else if (step === 3) {
    title = "새 비밀번호를 한 번 더 입력해 주세요";
  }

  const footer =
    step === 2 ? (
      <button
        className="cursor-pointer rounded-sm px-xs py-2xs text-body-sm text-meta underline underline-offset-4 transition-colors hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
        type="button"
        onClick={() => {
          setStep(1);
          setCurrentPin("");
          setAttemptErrorMessage(null);
        }}
      >
        현재 비밀번호 다시 입력
      </button>
    ) : step === 3 ? (
      <button
        className="cursor-pointer rounded-sm px-xs py-2xs text-body-sm text-meta underline underline-offset-4 transition-colors hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
        type="button"
        onClick={() => {
          setStep(2);
          setNewPin("");
          setAttemptErrorMessage(null);
        }}
      >
        새 비밀번호 다시 입력
      </button>
    ) : null;

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        title: "비밀번호 변경",
        description: "현재 비밀번호 확인 후 새 6자리 숫자를 설정해요",
      }}
      onClose={handleClose}
    >
      <div className="py-4">
        <PinKeypad
          title={title}
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          isLocked={isLocked}
          shakeKey={shakeKey}
          footer={footer}
          onComplete={handleComplete}
        />
      </div>
    </BottomSheet>
  );
}
