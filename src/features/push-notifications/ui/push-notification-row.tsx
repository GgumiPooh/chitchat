"use client";

import { cn } from "@/shared/lib";
import { SettingsRow, Switch } from "@/shared/ui";
import { Bell } from "lucide-react";
import { usePushNotifications } from "../model/use-push-notifications";

export type PushNotificationRowProps = {
  className?: string;
};

const DESCRIPTIONS = {
  on: "새 메시지가 오면 알려드려요",
  off: "새 메시지가 오면 알려드려요",
  blocked: "브라우저 설정에서 이 사이트의 알림을 허용해 주세요",
  unsupported: "홈 화면에 추가한 뒤 사용할 수 있어요",
} as const;

// INFO: REQUIREMENTS.md § 16.1. The in-flight state carries its own copy — the status starts at `unsupported`, so without it a supported device flashes the install prompt on every Settings mount.
const BUSY_DESCRIPTION = "알림 설정을 확인하고 있어요";

/** REQUIREMENTS.md § 16.1. The one place push is turned on, and it is per device. */
export function PushNotificationRow({ className }: PushNotificationRowProps) {
  const { status, isBusy, toggle } = usePushNotifications();
  const isActionable = status === "on" || status === "off";

  return (
    <SettingsRow
      className={cn(className)}
      description={isBusy ? BUSY_DESCRIPTION : DESCRIPTIONS[status]}
      Icon={Bell}
      label="알림"
      trailing={
        <Switch
          checked={status === "on"}
          disabled={isBusy || !isActionable}
          haptic
          aria-label="알림 받기"
          onCheckedChange={toggle}
        />
      }
    />
  );
}
