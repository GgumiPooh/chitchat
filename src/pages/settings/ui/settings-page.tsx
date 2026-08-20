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
import { DevRefreshRow } from "./dev-refresh-row";
import { DeviceSettingsRow } from "./device-settings-row";
import { EmoticonSettingsRow } from "./emoticon-settings-row";
import { MiniSettingsRow } from "./mini-settings-row";
import { ProfileCover } from "./profile-cover";
import { ServerSettingsRow } from "./server-settings-row";
import { ShortcutSettingsRow } from "./shortcut-settings-row";
import { ThemeSettingsRow } from "./theme-settings-row";

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
      {/* WARN: DESIGN.md § 7.16. The title follows the band underneath it, exactly as `ProfileCover`'s name does. The top scrim darkens the strip this sits in, so `text-ink` left over a cover is near-black on near-black — the scrim only makes a title legible if the title is `on-scrim`. */}
      <AppHeader
        titleClassName={user.profileBackgroundMediaId ? "text-on-scrim" : undefined}
        title="설정"
      />
      {/* INFO: DESIGN.md § 7.16. The cover runs full-bleed from the top of the screen, so it deliberately does *not* clear the floating header — its own top scrim is what keeps the 설정 title legible over a photo. */}
      <ProfileCover
        userId={user.id}
        name={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
        isProfileBackgroundVideo={isProfileBackgroundVideo}
      />
      {/* INFO: DESIGN.md § 7.11. Rows run edge to edge. */}
      {/* INFO: REQUIREMENTS.md § 12. The order is 나 → 대화 → 앱 → 계정, and it is a decision rather than the sequence these features happened to land in. */}
      {/* WARN: The resolved name, not the raw column. An empty nickname is legal (REQUIREMENTS.md § 8.7. falls back to the email local part), and seeding the editor from the column would open it on a blank field under a screen showing that fallback — with 저장 dead until the user typed. */}
      <ProfileSettingsRow
        nickname={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
      />
      <EmoticonSettingsRow />
      {/* INFO: REQUIREMENTS.md § 13. Directly under 이모티콘 — the two screens are one component, and a reader looking for one will look for the other beside it. */}
      <MiniSettingsRow />
      {/* INFO: REQUIREMENTS.md § 12.2. The wallpaper behind the conversation, and the one setting on this screen that changes what the *other* participant sees — the row says so, since nothing else on it does. It takes no id: the value is shared and live, so it comes from the stream rather than from this render. */}
      <ChatBackgroundRow />
      {/* INFO: DESIGN.md § 5.1. Per device, like 알림 — the choice lives in `localStorage`, so it describes this browser rather than the account. */}
      <ThemeSettingsRow />
      {/* INFO: REQUIREMENTS.md § 16.1. Both rows describe the same installation and settle from one launch sync, so they share a provider rather than each holding their own copy of the push state. */}
      <PushSettingsProvider>
        <PushNotificationRow />
        <PushSoundRow />
      </PushSettingsProvider>
      {/* INFO: REQUIREMENTS.md § 8.12. Per account, not per device like the row above — it governs what this user broadcasts, which is not a property of the browser they happen to be typing in. */}
      <TypingSettingsRow isEnabled={user.typingIndicatorEnabled} />
      <ShortcutSettingsRow shareKey={user.shareKey} />
      {/* INFO: REQUIREMENTS.md § 12. Reads `sessions` — the push subscriptions in the 알림 row above are a different set, and not revocable. */}
      <DeviceSettingsRow />
      {/* INFO: REQUIREMENTS.md § 12.4. Last of the 계정 group — the one screen here that acts on the deployment rather than on the account, and the one nobody opens twice a week. */}
      <ServerSettingsRow />
      {/* INFO: REQUIREMENTS.md § 15.1. Dev only — a production client is refreshed by the stream's `build` event and never needs to be told by hand. */}
      {IS_DEV && <DevRefreshRow />}
      <div className="flex justify-center p-md">
        <LogoutButton className="w-auto" />
      </div>
    </div>
  );
}
