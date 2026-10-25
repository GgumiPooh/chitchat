"use client";

import {
  PushNotificationRow,
  PushPreviewRow,
  PushSettingsProvider,
  PushSoundRow,
} from "@/features/push-notifications";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type NotificationsSettingsPageProps = {
  className?: string;
};

export function NotificationsSettingsPage({ className }: NotificationsSettingsPageProps) {
  const router = useRouter();

  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader
        title="알림 설정"
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
        {/* INFO: REQUIREMENTS.md § 16.1. Push notification settings */}
        <PushSettingsProvider>
          <PushNotificationRow />
          <PushSoundRow />
          <PushPreviewRow />
        </PushSettingsProvider>
      </div>
    </div>
  );
}
