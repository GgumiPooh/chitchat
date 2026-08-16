"use client";

import { EMOTICON_KIND_NOUNS, type EmoticonPackType } from "@/shared/config";
import { cn } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";

/** REQUIREMENTS.md § 13.5. The list that reorders, and the library that does not. */
export type EmoticonSettingsTab = "using" | "browse";

export type EmoticonSettingsTabsProps = {
  className?: string;
  /** REQUIREMENTS.md § 13. Which kind's screen these tabs are on — only the browse tab's label names it. */
  type: EmoticonPackType;
  tab: EmoticonSettingsTab;
  onTabChange: (tab: EmoticonSettingsTab) => void;
};

/**
 * REQUIREMENTS.md § 13.5. The two tabs of 이모티콘 관리.
 *
 * INFO: DESIGN.md § 7.1. A segmented control on one track rather than two chips — the
 * tabs are one exclusive choice, and the shared track is what says so. 화면 테마's
 * group is the same shape at a smaller size.
 *
 * WARN: State and not a route. Each tab is a different read of the same screen, and
 * routing them would give the 사용중 tab a second server seed to disagree with the
 * order the user has been dragging.
 */
export function EmoticonSettingsTabs({
  className,
  type,
  tab,
  onTabChange,
}: EmoticonSettingsTabsProps) {
  const { kind: kindNoun, pack: packNoun } = EMOTICON_KIND_NOUNS[type];
  const tabs: { value: EmoticonSettingsTab; label: string }[] = [
    { value: "using", label: "사용중" },
    { value: "browse", label: `${packNoun} 검색` },
  ];

  return (
    <div
      className={cn("flex items-center gap-0.5 rounded-full bg-surface-soft p-0.5", className)}
      role="group"
      aria-label={`${kindNoun} 관리 보기`}
    >
      {tabs.map(({ value, label }) => {
        const isSelected = tab === value;

        return (
          // WARN: DESIGN.md § 7.15.3. Ticking unconditionally, re-taps included — the selection lands in the same tick as the tap, so gating on `!isSelected` tears the overlay out during the click it is answering and the tick goes silent on the very switch it is for.
          // WARN: § 7.15.1. `keepsScroll` — two tabs tile the whole width of the strip, so without it a finger that starts its scroll here is kept by the overlay and the screen does not move.
          <HapticTarget
            key={value}
            className="flex flex-1"
            overlayClassName="touch-pan-y"
            keepsScroll
          >
            <button
              className={cn(
                "flex h-9 flex-1 cursor-pointer items-center justify-center rounded-full px-sm text-button-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
                isSelected
                  ? "bg-primary-tint text-primary"
                  : "text-meta group-active:bg-surface-pressed hover:bg-surface-strong hover:text-body active:bg-surface-pressed",
              )}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onTabChange(value)}
            >
              {label}
            </button>
          </HapticTarget>
        );
      })}
    </div>
  );
}
