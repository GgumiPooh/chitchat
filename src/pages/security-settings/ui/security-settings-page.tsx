"use client";

import type { DeviceSession } from "@/entities/session";
import { OfficeModeSettingsRow } from "@/features/office-mode";
import { DevicePinLockRow, PinSettingsRow } from "@/features/pin-lock";
import { DeviceList } from "@/features/session";
import { TypingSettingsRow } from "@/features/typing-indicator";
import { SETTINGS_ROUTE } from "@/shared/config";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { OfflineStaleNotice } from "@/shared/offline-ux";
import { AppHeader, IconButton } from "@/shared/ui";
import { ShortcutSettingsRow } from "@/widgets/device-settings";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type SecuritySettingsPageProps = {
  className?: string;
  user: User;
  sessions: DeviceSession[];
};

export function SecuritySettingsPage({ className, user, sessions }: SecuritySettingsPageProps) {
  const router = useRouter();

  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader
        title="보안 및 기기 관리"
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
      <div className="flex flex-col pt-(--app-header-inset)">
        {/* INFO: 사내망 환경 프라이버시 오피스 모드 */}
        <OfficeModeSettingsRow />
        {/* INFO: REQUIREMENTS.md § 5.5, § 12. 6자리 보안 PIN 화면 잠금 */}
        <DevicePinLockRow />
        <PinSettingsRow />
        {/* INFO: REQUIREMENTS.md § 8.12. 입력 중 표시 */}
        <TypingSettingsRow isEnabled={user.typingIndicatorEnabled} />
        {/* INFO: 단축어 키 */}
        <ShortcutSettingsRow shareKey={user.shareKey} />

        {/* INFO: REQUIREMENTS.md § 12. 로그인된 기기 목록 */}
        <div className="px-md pt-lg pb-xs">
          <h2 className="text-caption font-semibold text-meta">로그인된 기기</h2>
        </div>
        <OfflineStaleNotice />
        <DeviceList sessions={sessions} />
      </div>
    </div>
  );
}
