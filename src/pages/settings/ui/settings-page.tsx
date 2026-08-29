import { resolveDisplayName } from "@/entities/user";
import { ChatBackgroundRow } from "@/features/apply-photo";
import {
  PushNotificationRow,
  PushSettingsProvider,
  PushSoundRow,
} from "@/features/push-notifications";
import { LogoutButton } from "@/features/session";
import { TypingSettingsRow } from "@/features/typing-indicator";
import { ProfileSettingsRow } from "@/features/update-profile";
import { IS_DEV } from "@/shared/config";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { AppHeader } from "@/shared/ui";
import { MessageSoundSettingsRow, ThemeSettingsRow } from "@/widgets/device-settings";
import { DevRefreshRow } from "./dev-refresh-row";
import { DeviceSettingsRow } from "./device-settings-row";
import { EmoticonSettingsRow } from "./emoticon-settings-row";
import { LlmSystemPromptSettingsRow } from "./llm-system-prompt-settings-row";
import { MiniSettingsRow } from "./mini-settings-row";
import { ProfileCover } from "./profile-cover";
import { ServerSettingsRow } from "./server-settings-row";
import { ShortcutSettingsRow } from "./shortcut-settings-row";

export type SettingsPageProps = {
  className?: string;
  user: User;
  /** REQUIREMENTS.md § 12.1. Resolved by the route, since `users` holds the id and `media` holds the kind. */
  isProfileBackgroundVideo: boolean;
};

export function SettingsPage({ className, user, isProfileBackgroundVideo }: SettingsPageProps) {
  const displayName = resolveDisplayName(user);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      {/* WARN: DESIGN.md § 7.16. `text-ink` over a cover photo is near-black on near-black — `on-scrim` matches the cover's own top scrim. */}
      <AppHeader
        titleClassName={user.profileBackgroundMediaId ? "text-on-scrim" : undefined}
        title="설정"
      />
      {/* INFO: DESIGN.md § 7.16. Full-bleed from the top, deliberately not clearing the floating header — its scrim keeps the title legible over a photo. */}
      <ProfileCover
        userId={user.id}
        name={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
        isProfileBackgroundVideo={isProfileBackgroundVideo}
      />
      <div className="mx-auto flex w-full max-w-(--content-max-width) flex-col">
        {/* INFO: REQUIREMENTS.md § 12. Order is 나 → 대화 → 앱 → 계정, deliberately. */}
        {/* WARN: The resolved name, not the raw column — an empty nickname is legal (§ 8.7.) and seeding from the column would open the editor blank with 저장 dead. */}
        <ProfileSettingsRow
          nickname={displayName}
          avatarMediaId={user.avatarMediaId}
          profileBackgroundMediaId={user.profileBackgroundMediaId}
        />
        <EmoticonSettingsRow />
        {/* INFO: REQUIREMENTS.md § 13. Beside 이모티콘 — the two screens share a component. */}
        <MiniSettingsRow />
        {/* INFO: REQUIREMENTS.md § 12.2. The only row that changes what the *other* participant sees; takes no id since the wallpaper is shared and live off the stream. */}
        <ChatBackgroundRow />
        {/* INFO: REQUIREMENTS.md § 8.15. The shared 쨈미니 지침 — a conversation-wide row beside 채팅방 배경, and the settings-tab mirror of `AiSelectionBar`'s own `AI 지침` chip. */}
        <LlmSystemPromptSettingsRow />
        {/* INFO: DESIGN.md § 5.1. Per device, like 알림 — lives in `localStorage`. */}
        <ThemeSettingsRow />
        {/* INFO: REQUIREMENTS.md § 16.1. One provider — both rows describe the same installation and settle from one launch sync. */}
        <PushSettingsProvider>
          <PushNotificationRow />
          <PushSoundRow />
        </PushSettingsProvider>
        {/* INFO: REQUIREMENTS.md § 13.6. Per device, beside 알림 소리 — both are this browser's sounds. */}
        <MessageSoundSettingsRow />
        {/* INFO: REQUIREMENTS.md § 8.12. Per account, not per device — governs what this user broadcasts. */}
        <TypingSettingsRow isEnabled={user.typingIndicatorEnabled} />
        <ShortcutSettingsRow shareKey={user.shareKey} />
        {/* INFO: REQUIREMENTS.md § 12. Reads `sessions` — a different, revocable set from the 알림 row's push subscriptions. */}
        <DeviceSettingsRow />
        {/* INFO: REQUIREMENTS.md § 12.4. Last of 계정 — acts on the deployment, not the account. */}
        <ServerSettingsRow />
        {/* INFO: REQUIREMENTS.md § 15.1. Dev only — production refreshes off the stream's `build` event. */}
        {IS_DEV && <DevRefreshRow />}
        <div className="flex justify-center p-md">
          <LogoutButton className="w-auto" />
        </div>
      </div>
    </div>
  );
}
