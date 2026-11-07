"use client";

import { CALENDAR_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { Calendar } from "lucide-react";
import { useRouter } from "next/navigation";

export type CalendarSettingsRowProps = {
  className?: string;
};

const LABEL = "캘린더 설정";

export function CalendarSettingsRow({ className }: CalendarSettingsRowProps) {
  const router = useRouter();
  const { guard, isBlocked } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      className={className}
      label={LABEL}
      description="Google 캘린더 연동, 가져올 달력 선택"
      Icon={Calendar}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(CALENDAR_SETTINGS_ROUTE))}
    />
  );
}
