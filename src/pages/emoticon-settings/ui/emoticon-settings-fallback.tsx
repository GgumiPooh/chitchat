import { EMOTICON_PACK_ROW_HEIGHT_CLASS } from "@/features/emoticon-prefs";
import { EMOTICON_KIND_NOUNS, type EmoticonPackType } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Skeleton } from "@/shared/ui";

// INFO: REQUIREMENTS.md § 13.5. Enough rows to reach the fold without claiming a list the answer may not fill — the 사용중 tab is thirty-odd packs, not ten thousand.
const ROW_KEYS = ["a", "b", "c", "d", "e", "f"];

export type EmoticonSettingsFallbackProps = {
  className?: string;
  /** INFO: § 13. Only the title differs — the rows below are pack rows, which are one shape for both kinds. */
  type: EmoticonPackType;
};

/**
 * The fallback 이모티콘 관리 streams behind.
 *
 * INFO: The screen opens on 사용중 (REQUIREMENTS.md § 13.5.), so the rows below the
 * strip are that tab's pack list.
 */
export function EmoticonSettingsFallback({ className, type }: EmoticonSettingsFallbackProps) {
  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader title={`${EMOTICON_KIND_NOUNS[type].kind} 관리`} />
      {/* INFO: DESIGN.md § 7.12. The same clearance the screen uses, so nothing steps on the swap. */}
      <div className="pt-(--app-header-inset)" aria-hidden>
        {/* INFO: DESIGN.md § 7.1. The tab strip's own track, with its two 36px segments — the track is fixed geometry, so only the segments stand in for anything. */}
        <div className="mx-md mb-xs flex items-center gap-0.5 rounded-full bg-surface-soft p-0.5">
          <Skeleton className="h-9 flex-1 rounded-full" />
          <Skeleton className="h-9 flex-1 rounded-full" />
        </div>
        {ROW_KEYS.map((key) => (
          // INFO: REQUIREMENTS.md § 13.5. The pack row's own height, taken from the constant the windowed tab sums its offsets from rather than restated here.
          <div
            key={key}
            className={cn(
              "flex items-center gap-sm border-b border-hairline-soft bg-canvas px-md py-xs",
              EMOTICON_PACK_ROW_HEIGHT_CLASS,
            )}
          >
            {/* INFO: The 44px pack thumbnail, at the `rounded-sm` its tile carries. */}
            <Skeleton className="size-11 shrink-0 rounded-sm" />
            <span className="flex min-w-0 flex-1 flex-col px-2xs">
              <Skeleton className="h-[1lh] w-32 text-title-md" />
              <Skeleton className="h-[1lh] w-12 text-body-sm" />
            </span>
            {/* INFO: The drag handle's 44px target. */}
            <Skeleton className="size-11 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
