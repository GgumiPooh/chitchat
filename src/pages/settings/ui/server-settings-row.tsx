"use client";

import { SERVER_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * INFO: REQUIREMENTS.md § 12.4. The entry point to the ops console.
 *
 * WARN: The copy names only what the screen can always do. 백업 생성 and 고아 파일 정리 are
 * hidden wherever `OPS_API_URL` is unset (§ 12.4.), so promising them here would advertise
 * two controls that are not on the screen the row opens — where the list and the per-backup
 * deletion read R2 directly and are there either way.
 */
export function ServerSettingsRow() {
  const router = useRouter();

  return (
    <SettingsRow
      label="서버 관리"
      description="백업을 확인하고 관리할 수 있어요"
      Icon={HardDrive}
      haptic
      onClick={() => router.push(SERVER_SETTINGS_ROUTE)}
    />
  );
}
