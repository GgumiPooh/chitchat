import { IS_DEV } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, SettingsRowSkeleton, Skeleton } from "@/shared/ui";
import type { ReactNode } from "react";

// INFO: DESIGN.md § 7.11. The `Switch` three of these rows carry — 48×28, where the chevron the rest carry is 16.
const SWITCH = <Skeleton className="h-7 w-12 shrink-0 rounded-full" />;

// INFO: DESIGN.md § 7.1. 화면 테마's segmented track — three 36px buttons over `gap-0.5` inside `p-0.5`, so 116×40.
const THEME_SEGMENTS = <Skeleton className="h-10 w-29 shrink-0 rounded-full" />;

/**
 * REQUIREMENTS.md § 12. The rows `SettingsPage` draws, in order, each named by the
 * shape in its trailing slot — the icon, label and description are identical across
 * all of them, so that slot is the only thing this list has to carry.
 *
 * WARN: `IS_DEV` is read here for the same reason the screen reads it. The 새로고침
 * row exists only in development, and a fallback that ignored it would be one row
 * short of the screen it is standing in for on every local run.
 *
 * INFO: 채팅방 배경 takes the chevron rather than its 44px thumbnail. That thumbnail is
 * withheld until a wallpaper has been set (§ 12.2.), and the chevron is what the row
 * itself falls back to when there is none — a shape that can be right is better than
 * one that is wrong for everybody who has not set one.
 */
const ROWS: { key: string; trailing?: ReactNode }[] = [
  { key: "profile" },
  { key: "emoticons" },
  { key: "chat-background" },
  { key: "theme", trailing: THEME_SEGMENTS },
  { key: "push", trailing: SWITCH },
  { key: "push-sound", trailing: SWITCH },
  { key: "typing", trailing: SWITCH },
  { key: "devices" },
  ...(IS_DEV ? [{ key: "dev-refresh" }] : []),
];

export type SettingsFallbackProps = {
  className?: string;
};

/**
 * The fallback 설정 streams behind.
 *
 * INFO: DESIGN.md § 7.16. The cover band is `h-120` whatever is behind it, so the
 * rows below it stand exactly where they will stand. Its floor is `surface-soft` —
 * the no-cover answer — because nothing here can know yet whether there is a photo,
 * and half a screen of `scrim` for a user who has set none would be darker than the
 * screen it is announcing.
 */
export function SettingsFallback({ className }: SettingsFallbackProps) {
  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader title="설정" />
      <div
        className="flex h-120 shrink-0 flex-col items-center justify-end gap-sm bg-surface-soft pb-lg"
        aria-hidden
      >
        {/* INFO: DESIGN.md § 7.7. The 72px profile avatar. */}
        <Skeleton className="size-18 rounded-full" />
        <Skeleton className="h-[1lh] w-24 text-title-md" />
      </div>
      {ROWS.map(({ key, trailing }) => (
        <SettingsRowSkeleton key={key} trailing={trailing} />
      ))}
      {/* INFO: DESIGN.md § 7.1. 로그아웃 is a `w-auto` `Button`, so `min-h-12` at `rounded-md` in the row it is centred in. */}
      <div className="flex justify-center p-md" aria-hidden>
        <Skeleton className="h-12 w-24 rounded-md" />
      </div>
    </div>
  );
}
