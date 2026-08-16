"use client";

import { BackupPanel, OrphanPanel } from "@/features/server-ops";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
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
        {/* INFO: 고아 파일 정리 first, and only because the backup list is the one block whose height arrives late — under it, every fetch nudged this section down the screen. */}
        {isOpsAvailable && <OrphanPanel />}
        <BackupPanel isOpsAvailable={isOpsAvailable} />
      </div>
    </div>
  );
}
