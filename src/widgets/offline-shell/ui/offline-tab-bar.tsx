import { cn, type Optional } from "@/shared/lib";
import type { MirrorScreen } from "../model/mirror-screen";
import { MIRROR_TABS, toActiveTabIndex } from "../model/mirror-tabs";

export type OfflineTabBarProps = {
  className?: string;
  /** Nothing is filled until the effect that reads the path has run — see `toMirrorScreen`. */
  screen: Optional<MirrorScreen>;
};

/**
 * The mirror's own tab bar (REQUIREMENTS.md § 16.).
 *
 * WARN: Plain anchors, never `Link` — a client navigation asks for an RSC payload
 * that cannot arrive offline, and the router answers the failure with a document
 * navigation anyway. This is that navigation, without the round trip.
 *
 * WARN: The fill is placed from `screen` rather than from `usePathname`, which is
 * what keeps this document servable at a path it was not prerendered for.
 */
export function OfflineTabBar({ className, screen }: OfflineTabBarProps) {
  const activeIndex = toActiveTabIndex(screen);

  return (
    <nav className={cn("px-md md:hidden", className)} aria-label="주요 화면">
      <div className="pointer-events-auto flex h-(--tab-bar-height) items-stretch rounded-full border border-hairline glass p-2xs">
        <div className="relative flex flex-1 items-stretch">
          {activeIndex >= 0 && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary-tint"
              aria-hidden="true"
              style={{
                width: `calc(100% / ${MIRROR_TABS.length})`,
                translate: `${activeIndex * 100}% 0`,
              }}
            />
          )}
          <ul className="relative z-10 flex flex-1 items-stretch">
            {MIRROR_TABS.map(({ screens, href, label, Icon }, index) => {
              const isActive = index === activeIndex;
              const stateClassName = isActive ? "text-primary" : "text-meta group-hover:text-ink";

              return (
                <li key={screens[0]} className="flex-1">
                  <a
                    className={cn(
                      "group flex size-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-(--duration-state) outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                      !isActive && "hover:bg-surface-soft",
                    )}
                    href={href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                    <span className={cn("text-tab-label", stateClassName)}>{label}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
