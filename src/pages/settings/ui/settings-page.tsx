import { resolveDisplayName } from "@/entities/user";
import { PushNotificationRow } from "@/features/push-notifications";
import { LogoutButton } from "@/features/session";
import { ChatBackgroundRow } from "@/features/set-background";
import { TypingSettingsRow } from "@/features/typing-indicator";
import { ProfileSettingsRow } from "@/features/update-profile";
import { IS_DEV } from "@/shared/config";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { AppHeader } from "@/shared/ui";
import { DevRefreshRow } from "./dev-refresh-row";
import { EmoticonSettingsRow } from "./emoticon-settings-row";
import { ProfileCover } from "./profile-cover";

export type SettingsPageProps = {
  className?: string;
  user: User;
};

// TODO: Add the device list — REQUIREMENTS.md § 12., riding the `user_agent` and `last_success_at` § 16.1. already stores.
export function SettingsPage({ className, user }: SettingsPageProps) {
  const displayName = resolveDisplayName(user);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="설정" />
      {/* INFO: DESIGN.md § 7.16. The cover runs full-bleed from the top of the screen, so it deliberately does *not* clear the floating header — its own top scrim is what keeps the 설정 title legible over a photo. */}
      <ProfileCover
        userId={user.id}
        name={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
      />
      {/* INFO: DESIGN.md § 7.11. Rows run edge to edge. */}
      {/* WARN: The resolved name, not the raw column. An empty nickname is legal (REQUIREMENTS.md § 8.7. falls back to the email local part), and seeding the editor from the column would open it on a blank field under a screen showing that fallback — with 저장 dead until the user typed. */}
      <ProfileSettingsRow
        nickname={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
      />
      <PushNotificationRow />
      {/* INFO: REQUIREMENTS.md § 8.12. Per account, not per device like the row above — it governs what this user broadcasts, which is not a property of the browser they happen to be typing in. */}
      <TypingSettingsRow isEnabled={user.typingIndicatorEnabled} />
      {/* INFO: REQUIREMENTS.md § 12.2. The wallpaper this user sees behind the conversation, which the other participant never does. */}
      <ChatBackgroundRow chatBackgroundMediaId={user.chatBackgroundMediaId} />
      <EmoticonSettingsRow />
      {/* INFO: REQUIREMENTS.md § 15.1. Dev only — a production client is refreshed by the stream's `build` event and never needs to be told by hand. */}
      {IS_DEV && <DevRefreshRow />}
      <div className="flex justify-center p-md">
        <LogoutButton className="w-auto" />
      </div>
    </div>
  );
}
