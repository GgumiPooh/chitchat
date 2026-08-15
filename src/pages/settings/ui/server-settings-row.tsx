"use client";

import { SERVER_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { HardDrive } from "lucide-react";
import { useRouter } from "next/navigation";

// INFO: REQUIREMENTS.md § 12.4. The entry point to the ops console.
export function ServerSettingsRow() {
  const router = useRouter();

  return (
    <SettingsRow
      label="서버 관리"
      description="백업을 만들고 저장소를 정리할 수 있어요"
      Icon={HardDrive}
      haptic
      onClick={() => router.push(SERVER_SETTINGS_ROUTE)}
    />
  );
}
