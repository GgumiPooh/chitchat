import { resolveDisplayName } from "@/entities/user";
import { LogoutButton } from "@/features/session";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { AppHeader, Avatar } from "@/shared/ui";

export type SettingsPageProps = {
  className?: string;
  user: User;
};

// TODO: Add the profile editor, emoticon settings, and device list — step 10 of REQUIREMENTS.md § 17.
export function SettingsPage({ className, user }: SettingsPageProps) {
  const displayName = resolveDisplayName(user);

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="설정" />
      <div className="flex flex-col items-center gap-md p-md pt-xl">
        <Avatar name={displayName} size="profile" />
        <p className="text-title-md text-ink">{displayName}</p>
        <LogoutButton className="w-auto" />
      </div>
    </div>
  );
}
