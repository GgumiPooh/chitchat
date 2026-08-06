"use client";

import { EMOTICON_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { Smile } from "lucide-react";
import { useRouter } from "next/navigation";

// INFO: REQUIREMENTS.md § 12. The entry point to the § 13.5. management screen.
export function EmoticonSettingsRow() {
  const router = useRouter();

  return (
    <SettingsRow
      label="이모티콘"
      description="이모티콘을 만들고 순서를 바꾸거나 숨길 수 있어요"
      Icon={Smile}
      haptic
      onClick={() => router.push(EMOTICON_SETTINGS_ROUTE)}
    />
  );
}
