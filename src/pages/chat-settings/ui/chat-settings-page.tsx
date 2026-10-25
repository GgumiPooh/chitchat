"use client";

import { ChatBackgroundRow } from "@/features/apply-photo";
import { SETTINGS_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import {
  EmoticonSettingsRow,
  LlmSystemPromptSettingsRow,
  MessageSoundSettingsRow,
  MiniSettingsRow,
} from "@/widgets/device-settings";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export type ChatSettingsPageProps = {
  className?: string;
};

export function ChatSettingsPage({ className }: ChatSettingsPageProps) {
  const router = useRouter();

  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader
        title="채팅방 설정"
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
        {/* INFO: REQUIREMENTS.md § 13.6. 채팅방 효과음 */}
        <MessageSoundSettingsRow />
        {/* INFO: REQUIREMENTS.md § 12.2. 채팅방 배경화면 */}
        <ChatBackgroundRow />
        {/* INFO: REQUIREMENTS.md § 8.15. AI 지침 */}
        <LlmSystemPromptSettingsRow />
        {/* INFO: REQUIREMENTS.md § 13. 이모티콘 묶음 관리 */}
        <EmoticonSettingsRow />
        {/* INFO: REQUIREMENTS.md § 13. 미니이모티콘 묶음 관리 */}
        <MiniSettingsRow />
      </div>
    </div>
  );
}
