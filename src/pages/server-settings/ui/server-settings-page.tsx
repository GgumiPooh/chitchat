"use client";

import { BackupPanel, OrphanPanel } from "@/features/server-ops";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type ServerSettingsPageProps = {
  className?: string;
};

/** REQUIREMENTS.md § 12.4. The ops console — backups and the orphan sweep, reached from a 설정 row. */
export function ServerSettingsPage({ className }: ServerSettingsPageProps) {
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
        <BackupPanel />
        <OrphanPanel />
      </div>
    </div>
  );
}
