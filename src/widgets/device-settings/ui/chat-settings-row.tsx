"use client";

import { CHAT_SETTINGS_ROUTE } from "@/shared/config";
import { SettingsRow } from "@/shared/ui";
import { MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";

export type ChatSettingsRowProps = {
  className?: string;
};

export function ChatSettingsRow({ className }: ChatSettingsRowProps) {
  const router = useRouter();

  return (
    <SettingsRow
      className={className}
      label="채팅방 설정"
      description="채팅방 효과음, 배경화면, AI 지침, 이모티콘"
      Icon={MessageSquare}
      haptic
      onClick={() => router.push(CHAT_SETTINGS_ROUTE)}
    />
  );
}
