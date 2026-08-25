"use client";

import { APP_NAME, CHAT_ROUTE } from "@/shared/config";
import { cn, useRovingTabIndex, type Optional } from "@/shared/lib";
import Image from "next/image";
import type { MirrorScreen } from "../model/mirror-screen";
import { MIRROR_TABS, toActiveTabIndex } from "../model/mirror-tabs";

export type OfflineNavRailProps = {
  className?: string;
  screen: Optional<MirrorScreen>;
};

/**
 * The mirror's `NavRail` (AGENTS.md § 4.1.), with the same anchors `OfflineTabBar`
 * carries and for the same reason. No 첨부 and no profile avatar: both write, and
 * neither has a snapshot to answer from.
 */
export function OfflineNavRail({ className, screen }: OfflineNavRailProps) {
  const activeIndex = toActiveTabIndex(screen);
  const handleKeyDown = useRovingTabIndex({
    orientation: "vertical",
    selector: "[data-rail-item]",
  });

  return (
    <nav
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-(--rail-width) flex-col items-center gap-md border-r border-hairline bg-canvas py-md",
        className,
      )}
      aria-label="주요 화면"
    >
      <a
        className="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
        href={CHAT_ROUTE}
        aria-label={APP_NAME}
      >
        <Image
          className="size-10 rounded-full"
          src="/icons/icon.svg"
          alt=""
          width={40}
          height={40}
          unoptimized
        />
      </a>

      <ul className="relative flex flex-col items-stretch gap-2xs" onKeyDown={handleKeyDown}>
        {activeIndex >= 0 && (
          <span
            className="pointer-events-none absolute inset-x-0 top-0 rounded-full bg-primary-tint"
            aria-hidden="true"
            style={{
              height: `calc(100% / ${MIRROR_TABS.length})`,
              translate: `0 ${activeIndex * 100}%`,
            }}
          />
        )}
        {MIRROR_TABS.map(({ screens, href, label, Icon }, index) => {
          const isActive = index === activeIndex;
          const stateClassName = isActive ? "text-primary" : "text-meta hover:text-ink";

          return (
            <li key={screens[0]} className="relative z-10">
              <a
                className="group relative flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                href={href}
                tabIndex={isActive || (activeIndex < 0 && index === 0) ? 0 : -1}
                data-rail-item=""
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                <span className={cn("text-tab-label", stateClassName)}>{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
