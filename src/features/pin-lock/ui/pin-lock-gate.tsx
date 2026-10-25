"use client";

import { cn, useHasSessionKey, type Nullable } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";
import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState, type PropsWithChildren } from "react";
import { requestPinResetLogout, submitPinHandshake } from "../api/pin-api";
import { PinKeypad } from "./pin-keypad";

export type PinLockGateProps = PropsWithChildren<{
  className?: string;
  hasPinSet: boolean;
  initialLockedUntil: Nullable<string>;
  serverPublicKey: string;
}>;

export function PinLockGate({
  className,
  children,
  hasPinSet,
  initialLockedUntil,
  serverPublicKey,
}: PinLockGateProps) {
  const hasSessionKey = useHasSessionKey();

  const [isPinConfigured, setIsPinConfigured] = useState(hasPinSet);
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [firstPin, setFirstPin] = useState("");

  const [lockedUntil, setLockedUntil] = useState<Nullable<string>>(initialLockedUntil);
  const [, setRemainingAttempts] = useState<number>(5);
  const [attemptErrorMessage, setAttemptErrorMessage] = useState<Nullable<string>>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  const [now, setNow] = useState(() => Date.now());

  // INFO: Live 1-second countdown when client is locked out.
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

      if (!isPinConfigured) {
        if (setupStep === 1) {
          setFirstPin(pin);
          setSetupStep(2);
          setAttemptErrorMessage(null);
          return;
        }

        if (pin !== firstPin) {
          setShakeKey((k) => k + 1);
          setSetupStep(1);
          setFirstPin("");
          setAttemptErrorMessage("입력한 두 비밀번호가 서로 달라요. 다시 입력해 주세요");
          return;
        }

        setIsSubmitting(true);
        const result = await submitPinHandshake(serverPublicKey, { mode: "setup", pin });
        setIsSubmitting(false);

        if (result.ok) {
          setIsPinConfigured(true);
          setAttemptErrorMessage(null);
        } else {
          setShakeKey((k) => k + 1);
          setSetupStep(1);
          setFirstPin("");
          if (result.lockedUntil) {
            setLockedUntil(result.lockedUntil);
          } else {
            setAttemptErrorMessage("비밀번호 설정에 실패했어요. 다시 시도해 주세요");
          }
        }
        return;
      }

      // INFO: 1-step verification flow for unlocking the app.
      setIsSubmitting(true);
      const result = await submitPinHandshake(serverPublicKey, { mode: "verify", pin });
      setIsSubmitting(false);

      if (result.ok) {
        setAttemptErrorMessage(null);
      } else {
        setShakeKey((k) => k + 1);
        if (result.status === 429 || result.lockedUntil) {
          setLockedUntil(result.lockedUntil);
        } else if (result.status === 401) {
          const attempts = result.remainingAttempts ?? 0;
          setRemainingAttempts(attempts);
          setAttemptErrorMessage(`비밀번호가 일치하지 않아요 (남은 기회 ${attempts}회)`);
        } else {
          setAttemptErrorMessage("잠금 해제에 실패했어요. 다시 시도해 주세요");
        }
      }
    },
    [firstPin, isLocked, isPinConfigured, isSubmitting, serverPublicKey, setupStep],
  );

  // INFO: Render minimal centered spinner during SSR / hydration before sessionStorage is checked.
  if (hasSessionKey === null) {
    return (
      <div className={cn("flex min-h-dvh w-full items-center justify-center bg-canvas", className)}>
        <LoaderCircle className="size-6 animate-spin text-meta-soft" aria-hidden />
      </div>
    );
  }

  if (hasSessionKey) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  const errorMessage = isLocked
    ? `입력 횟수를 초과했어요. ${secondsLeft}초 후에 다시 시도해 주세요`
    : attemptErrorMessage;

  let title = "비밀번호를 입력해 주세요";

  if (!isPinConfigured) {
    title =
      setupStep === 1 ? "사용할 비밀번호를 입력해 주세요" : "비밀번호를 한 번 더 입력해 주세요";
  }

  const footer = isPinConfigured ? (
    <button
      className="cursor-pointer rounded-sm px-xs py-2xs text-body-sm text-meta underline underline-offset-4 transition-colors hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
      type="button"
      onClick={() => setIsResetModalOpen(true)}
    >
      비밀번호를 잊으셨나요?
    </button>
  ) : setupStep === 2 ? (
    <button
      className="cursor-pointer rounded-sm px-xs py-2xs text-body-sm text-meta underline underline-offset-4 transition-colors hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-pressed"
      type="button"
      onClick={() => {
        setSetupStep(1);
        setFirstPin("");
        setAttemptErrorMessage(null);
      }}
    >
      처음부터 다시 입력
    </button>
  ) : null;

  return (
    <div
      className={cn(
        "flex min-h-dvh w-full flex-col items-center justify-center bg-canvas px-6 py-10",
        className,
      )}
    >
      <PinKeypad
        title={title}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        isLocked={isLocked}
        shakeKey={shakeKey}
        footer={footer}
        onComplete={handleComplete}
      />

      <Modal
        isOpen={isResetModalOpen}
        header={{
          title: "비밀번호를 재설정할까요?",
          description:
            "현재 기기에서 로그아웃되며, 다시 로그인하면 새 비밀번호를 설정할 수 있어요.",
        }}
        onClose={() => setIsResetModalOpen(false)}
      >
        {/* WARN: flex-1 on both — Button is w-full shrink-0, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => setIsResetModalOpen(false)}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            haptic
            onClick={() => void requestPinResetLogout()}
          >
            로그아웃 후 재설정
          </Button>
        </div>
      </Modal>
    </div>
  );
}
