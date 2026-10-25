"use client";

import { useOfficeMode } from "@/shared/lib";
import { AppHeader } from "@/shared/ui";

export type SettingsHeaderProps = {
  className?: string;
  hasCover?: boolean;
};

export function SettingsHeader({ className, hasCover = false }: SettingsHeaderProps) {
  const { isOfficeMode } = useOfficeMode();
  const effectiveHasCover = !isOfficeMode && hasCover;

  return (
    <AppHeader
      className={className}
      titleClassName={effectiveHasCover ? "text-on-scrim" : undefined}
      title="설정"
    />
  );
}
