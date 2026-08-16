"use client";

import { BackupPanel, OrphanPanel, PurgePanel } from "@/features/server-ops";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { OfflineStaleNotice } from "@/shared/offline-ux";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type ServerSettingsPageProps = {
  className?: string;
  /**
   * Whether this deployment can start an ops run (`OPS_GITHUB_TOKEN`).
   *
   * INFO: REQUIREMENTS.md § 12.4. Only the work that service still owns is gated on it —
   * the backup list and the per-backup deletion read R2 directly and are always offered.
   */
  isOpsAvailable: boolean;
};

/** REQUIREMENTS.md § 12.4. The ops console — backups and the orphan sweep, reached from a 설정 row. */
export function ServerSettingsPage({ className, isOpsAvailable }: ServerSettingsPageProps) {
  const router = useRouter();

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="서버 관리"
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
      <div className="flex flex-col gap-md pt-(--app-header-inset) pb-lg">
        <OfflineStaleNotice />
        {/* INFO: The backup list is the one block whose height arrives late, so it stays last — under it, every fetch nudged the sections above down the screen. */}
        {/* INFO: 삭제 파일 회수 above 고아 파일 정리, routine before exceptional: the safe button is the one a thumb lands on first, and the destructive pair sits below where it has to be reached for. */}
        {isOpsAvailable && <PurgePanel />}
        {isOpsAvailable && <OrphanPanel />}
        <BackupPanel isOpsAvailable={isOpsAvailable} />
      </div>
    </div>
  );
}
