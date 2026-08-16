"use client";

import { SERVER_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";

const LABEL = "서버 관리";

/**
 * INFO: REQUIREMENTS.md § 12.4. The entry point to the ops console.
 *
 * WARN: The copy names only what the screen can always do. 백업 생성 and 고아 파일 정리 are
 * hidden wherever `OPS_GITHUB_TOKEN` is unset (§ 12.4.), so promising them here would advertise
 * two controls that are not on the screen the row opens — where the list and the per-backup
 * deletion read R2 directly and are there either way.
 */
export function ServerSettingsRow() {
  const router = useRouter();
  const { isBlocked, guard } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      label={LABEL}
      description="백업을 확인하고 관리할 수 있어요"
      Icon={HardDrive}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(SERVER_SETTINGS_ROUTE))}
    />
  );
}
