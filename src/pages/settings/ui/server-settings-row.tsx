"use client";

import { SERVER_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";

const LABEL = "서버 관리";

// INFO: REQUIREMENTS.md § 12.4. The entry point to the ops console.
export function ServerSettingsRow() {
  const router = useRouter();
  const { isBlocked, guard } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      label={LABEL}
      description="백업을 만들고 저장소를 정리할 수 있어요"
      Icon={HardDrive}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(SERVER_SETTINGS_ROUTE))}
    />
  );
}
