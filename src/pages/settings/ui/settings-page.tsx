import { resolveDisplayName } from "@/entities/user";
import { PushNotificationRow } from "@/features/push-notifications";
import { LogoutButton } from "@/features/session";
import { ProfileSettingsRow } from "@/features/update-profile";
import { IS_DEV } from "@/shared/config";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { AppHeader, Avatar } from "@/shared/ui";
import { DevRefreshRow } from "./dev-refresh-row";
import { EmoticonSettingsRow } from "./emoticon-settings-row";

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
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex flex-col items-center gap-md p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        {/* INFO: REQUIREMENTS.md § 12. Tapping it enlarges the photo, exactly as it does in chat — editing is the row below, so one gesture never means two things. */}
        <Avatar name={displayName} mediaId={user.avatarMediaId} size="profile" canEnlarge />
        <p className="text-title-md text-ink">{displayName}</p>
      </div>
      {/* INFO: DESIGN.md § 7.11. Rows run edge to edge, so they sit outside the padded block above. */}
      {/* WARN: The resolved name, not the raw column. An empty nickname is legal (REQUIREMENTS.md § 8.7. falls back to the email local part), and seeding the editor from the column would open it on a blank field under a screen showing that fallback — with 저장 dead until the user typed. */}
      <ProfileSettingsRow nickname={displayName} avatarMediaId={user.avatarMediaId} />
      <PushNotificationRow />
      <EmoticonSettingsRow />
      {/* INFO: REQUIREMENTS.md § 15.1. Dev only — a production client is refreshed by the stream's `build` event and never needs to be told by hand. */}
      {IS_DEV && <DevRefreshRow />}
      <div className="flex justify-center p-md">
        <LogoutButton className="w-auto" />
      </div>
    </div>
  );
}
