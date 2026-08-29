"use client";

import { cn } from "@/shared/lib";
import { useTheme, type Theme } from "@/shared/theme";
import { HapticTarget, SettingsRow } from "@/shared/ui";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

const OPTIONS: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "시스템", Icon: Monitor },
  { value: "light", label: "밝게", Icon: Sun },
  { value: "dark", label: "어둡게", Icon: Moon },
];

export type ThemeSettingsRowProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 12., DESIGN.md § 5.1. The theme switch — 시스템 / 밝게 / 어둡게.
 *
 * INFO: Per device, like the 알림 row and unlike 입력 중 표시. `next-themes` keeps the
 * choice in `localStorage`, so it describes this browser rather than the account.
 *
 * WARN: The row itself is not a button. Three segments are three targets, and a row
 * that also took a tap would advance the theme from wherever the finger missed.
 */
export function ThemeSettingsRow({ className }: ThemeSettingsRowProps) {
  const [theme, setTheme] = useTheme();

  return (
    <SettingsRow
      className={className}
      label="화면 테마"
      description="시스템을 따르거나 직접 고를 수 있어요"
      Icon={theme === "dark" ? Moon : theme === "light" ? Sun : Monitor}
      trailing={
        // INFO: DESIGN.md § 7.1. A segmented control rather than three chips — the options are one exclusive choice, and the shared track is what says so.
        <div className="flex items-center gap-0.5 rounded-full bg-surface-soft p-0.5" role="group">
          {OPTIONS.map(({ value, label, Icon }) => {
            const isSelected = theme === value;

            return (
              // INFO: Silent on the segment already chosen, for the reason `Chip` is — re-picking it chooses nothing.
              <HapticTarget key={value} className="inline-flex shrink-0" isTicking={!isSelected}>
                <button
                  className={cn(
                    "inline-flex size-9 cursor-pointer items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
                    isSelected
                      ? "bg-primary-tint text-primary"
                      : "text-meta group-active:bg-surface-pressed hover:bg-surface-strong hover:text-body active:bg-surface-pressed",
                  )}
                  type="button"
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                </button>
              </HapticTarget>
            );
          })}
        </div>
      }
    />
  );
}
