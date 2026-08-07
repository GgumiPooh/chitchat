"use client";

import { DEVICE_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";

// INFO: REQUIREMENTS.md § 12. The entry point to the device list.
export function DeviceSettingsRow() {
  const router = useRouter();

  return (
    <SettingsRow
      label="로그인된 기기"
      description="다른 기기에서 로그아웃할 수 있어요"
      Icon={MonitorSmartphone}
      haptic
      onClick={() => router.push(DEVICE_SETTINGS_ROUTE)}
    />
  );
}
