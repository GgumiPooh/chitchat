"use client";

import { DEVICE_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";

const LABEL = "로그인된 기기";

// INFO: REQUIREMENTS.md § 12. The entry point to the device list.
export function DeviceSettingsRow() {
  const router = useRouter();
  // WARN: Left ungated the push fails its RSC fetch, falls back to a document navigation, and § 16.'s worker answers with `/offline` — whose one control leads to 채팅, so the reader is thrown off 설정 entirely.
  const { isBlocked, guard } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      label={LABEL}
      description="다른 기기에서 로그아웃할 수 있어요"
      Icon={MonitorSmartphone}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(DEVICE_SETTINGS_ROUTE))}
    />
  );
}
