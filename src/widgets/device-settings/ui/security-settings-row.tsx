"use client";

import { SECURITY_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

export type SecuritySettingsRowProps = {
  className?: string;
};

export function SecuritySettingsRow({ className }: SecuritySettingsRowProps) {
  const router = useRouter();

  return (
    <SettingsRow
      className={className}
      label="보안 및 기기 관리"
      description="오피스 모드, 화면 잠금, 로그인된 기기"
      Icon={ShieldCheck}
      haptic
      onClick={() => router.push(SECURITY_SETTINGS_ROUTE)}
    />
  );
}
