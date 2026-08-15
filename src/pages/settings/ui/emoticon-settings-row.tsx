"use client";

import { EMOTICON_SETTINGS_ROUTE } from "@/shared/config";
import { toOfflineOpenMessage, useOfflineGate } from "@/shared/offline-ux";
import { SettingsRow } from "@/shared/ui";
import { Smile } from "lucide-react";
import { useRouter } from "next/navigation";

const LABEL = "이모티콘";

// INFO: REQUIREMENTS.md § 12. The entry point to the § 13.5. management screen.
export function EmoticonSettingsRow() {
  const router = useRouter();
  // INFO: § 13.7. The screen's own data and every asset on it come from a second deployment, so nothing about it survives the connection going.
  const { isBlocked, guard } = useOfflineGate(toOfflineOpenMessage(LABEL));

  return (
    <SettingsRow
      label={LABEL}
      description="이모티콘을 만들고 순서를 바꾸거나 숨길 수 있어요"
      Icon={Smile}
      haptic
      isUnavailable={isBlocked}
      onClick={guard(() => router.push(EMOTICON_SETTINGS_ROUTE))}
    />
  );
}
