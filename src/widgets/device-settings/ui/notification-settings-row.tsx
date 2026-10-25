"use client";

import { NOTIFICATIONS_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";

export type NotificationSettingsRowProps = {
  className?: string;
};

export function NotificationSettingsRow({ className }: NotificationSettingsRowProps) {
  const router = useRouter();

  return (
    <SettingsRow
      className={className}
      label="알림 설정"
      description="푸시 알림, 알림 소리, 알림 내용 표시"
      Icon={Bell}
      haptic
      onClick={() => router.push(NOTIFICATIONS_SETTINGS_ROUTE)}
    />
  );
}
