"use client";

import { SettingsRow } from "@/shared/ui";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { PinSettingsSheet } from "./pin-settings-sheet";

export type PinSettingsRowProps = {
  className?: string;
};

export function PinSettingsRow({ className }: PinSettingsRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <SettingsRow
        className={className}
        description="화면 잠금 및 보안 확인에 사용하는 6자리 PIN 변경"
        Icon={KeyRound}
        label="PIN 비밀번호 변경"
        haptic
        onClick={() => setIsOpen(true)}
      />
      <PinSettingsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
