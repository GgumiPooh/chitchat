import { resolveDisplayName } from "@/entities/user";
import { LogoutButton } from "@/features/session";
import { ProfileSettingsRow } from "@/features/update-profile";
import { IS_DEV } from "@/shared/config";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import {
  ChatSettingsRow,
  DevRefreshRow,
  NotificationSettingsRow,
  SecuritySettingsRow,
  ServerSettingsRow,
  ThemeSettingsRow,
} from "@/widgets/device-settings";
import { ProfileCover } from "./profile-cover";
import { SettingsHeader } from "./settings-header";

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
      <SettingsHeader hasCover={Boolean(user.profileBackgroundMediaId)} />
      {/* INFO: DESIGN.md § 7.16. Full-bleed from the top, deliberately not clearing the floating header — its scrim keeps the title legible over a photo. */}
      <ProfileCover
        userId={user.id}
        name={displayName}
        avatarMediaId={user.avatarMediaId}
        profileBackgroundMediaId={user.profileBackgroundMediaId}
        isProfileBackgroundVideo={isProfileBackgroundVideo}
      />
      <div className="mx-auto flex w-full max-w-(--content-max-width) flex-col">
        {/* INFO: REQUIREMENTS.md § 12. Profile settings row */}
        <ProfileSettingsRow
          nickname={displayName}
          avatarMediaId={user.avatarMediaId}
          profileBackgroundMediaId={user.profileBackgroundMediaId}
        />

        {/* INFO: Subpage navigation menus */}
        <ChatSettingsRow />
        <NotificationSettingsRow />
        <SecuritySettingsRow />
        <ServerSettingsRow />

        {/* INFO: DESIGN.md § 5.1. Per device, like 알림 — lives in `localStorage`. */}
        <ThemeSettingsRow />

        {/* INFO: REQUIREMENTS.md § 15.1. Dev only — production refreshes off the stream's `build` event. */}
        {IS_DEV && <DevRefreshRow />}
        <div className="flex justify-center p-md">
          <LogoutButton className="w-auto" />
        </div>
      </div>
    </div>
  );
}
