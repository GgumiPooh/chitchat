import { resolveDisplayName } from "@/entities/user";
import { PushNotificationRow } from "@/features/push-notifications";
import { LogoutButton } from "@/features/session";
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

// TODO: Add the profile editor and the device list — step 10 of REQUIREMENTS.md § 17.
export function SettingsPage({ className, user }: SettingsPageProps) {
  const displayName = resolveDisplayName(user);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="설정" />
      {/* INFO: DESIGN.md § 7.12. The header floats over the content, so a screen that starts at the top clears it itself. */}
      <div className="flex flex-col items-center gap-md p-md pt-[calc(var(--app-header-inset)+var(--spacing-md))]">
        <Avatar name={displayName} size="profile" />
        <p className="text-title-md text-ink">{displayName}</p>
      </div>
      {/* INFO: DESIGN.md § 7.11. Rows run edge to edge, so they sit outside the padded block above. */}
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
