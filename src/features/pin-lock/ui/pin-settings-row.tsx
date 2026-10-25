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
        label="보안 PIN 변경"
        description="앱 잠금 해제에 사용하는 6자리 숫자 변경"
        Icon={KeyRound}
        haptic
        onClick={() => setIsOpen(true)}
      />
      <PinSettingsSheet isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
