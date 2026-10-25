"use client";

import { isDevicePinLockEnabled, setDevicePinLockEnabled } from "@/shared/lib";
import { SettingsRow, Switch, toast } from "@/shared/ui";
import { ShieldCheck } from "lucide-react";
import { useCallback, useState } from "react";
import { PinVerifySheet } from "./pin-verify-sheet";

export type DevicePinLockRowProps = {
  className?: string;
};

const ENABLED_DESCRIPTION = "앱을 새로 열 때 6자리 비밀번호로 잠금을 해제해요";
const DISABLED_DESCRIPTION = "이 기기에서는 비밀번호 입력 없이 바로 앱을 열어요";

export function DevicePinLockRow({ className }: DevicePinLockRowProps) {
  const [isLockEnabled, setIsLockEnabled] = useState(() => isDevicePinLockEnabled());
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  const handleToggle = useCallback((nextEnabled: boolean) => {
    if (nextEnabled) {
      // INFO: Re-enabling PIN lock immediately removes persistent key from localStorage.
      const ok = setDevicePinLockEnabled(true);
      if (ok) {
        setIsLockEnabled(true);
        toast.success("이 기기에서 화면 잠금을 켰어요");
      }
      return;
    }

    // SEC: Turning off PIN lock on this device requires verifying current PIN.
    setIsVerifyOpen(true);
  }, []);

  const handleVerifySuccess = useCallback(() => {
    const ok = setDevicePinLockEnabled(false);
    if (ok) {
      setIsLockEnabled(false);
      toast.success("이 기기에서 화면 잠금을 해제했어요");
    } else {
      toast.error("화면 잠금을 해제하지 못했어요");
    }
  }, []);

  return (
    <>
      <SettingsRow
        className={className}
        description={isLockEnabled ? ENABLED_DESCRIPTION : DISABLED_DESCRIPTION}
        Icon={ShieldCheck}
        label="이 기기에서 화면 잠금"
        trailing={
          <Switch
            checked={isLockEnabled}
            haptic
            aria-label="이 기기에서 화면 잠금 켜기"
            onCheckedChange={handleToggle}
          />
        }
      />
      <PinVerifySheet
        isOpen={isVerifyOpen}
        title="화면 잠금 끄기"
        description="이 기기에서 잠금을 끄려면 현재 비밀번호를 입력해 주세요"
        onClose={() => setIsVerifyOpen(false)}
        onSuccess={handleVerifySuccess}
      />
    </>
  );
}
