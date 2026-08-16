"use client";

import { MINI_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { Sticker } from "lucide-react";
import { useRouter } from "next/navigation";

const LABEL = "미니이모티콘";

// INFO: REQUIREMENTS.md § 13. The entry point to 미니이모티콘's own management screen, directly under 이모티콘's — the two are the same screen and belong side by side.
export function MiniSettingsRow() {
  const router = useRouter();
  // INFO: § 13.7. The screen's own data and every asset on it come from a second deployment, so nothing about it survives the connection going.
  const { isBlocked, guard } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      label={LABEL}
      description="글자 사이에 넣어 보내는 작은 이모티콘이에요"
      Icon={Sticker}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(MINI_SETTINGS_ROUTE))}
    />
  );
}
