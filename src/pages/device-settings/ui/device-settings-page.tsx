"use client";

import type { DeviceSession } from "@/entities/session";
import { DeviceList } from "@/features/session";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { OfflineStaleNotice } from "@/shared/offline-ux";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type DeviceSettingsPageProps = {
  className?: string;
  sessions: DeviceSession[];
};

/** REQUIREMENTS.md § 12. The logged-in device list, reached from a 설정 row. */
export function DeviceSettingsPage({ className, sessions }: DeviceSettingsPageProps) {
  const router = useRouter();

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="로그인된 기기"
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            haptic
            aria-label="뒤로"
            onClick={() => router.push(SETTINGS_ROUTE)}
          />
        }
      />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="pt-(--app-header-inset)">
        <OfflineStaleNotice />
        <DeviceList sessions={sessions} />
      </div>
    </div>
  );
}
